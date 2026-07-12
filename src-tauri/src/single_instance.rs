//! Single-instance lock, scoped per рабочей директории (`cwd`), а не глобально
//! на всё приложение. `tauri-plugin-single-instance` для этого не подходит —
//! на Linux он ключуется по `identifier` из `tauri.conf.json`, то есть дедуп
//! всегда глобальный для всего приложения, без возможности параметризовать
//! ключ директорией во время выполнения.
//!
//! Механизм: unix-сокет по пути `~/.pi-pine/run/<encoded-cwd>.sock`
//! (кодирование как в `sessions::encode_cwd`, совместимое с pi CLI). Запуск в
//! той же директории коннектится к существующему сокету и просит фокус —
//! запуск в другой директории получает свой собственный сокет и стартует
//! независимо.

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc;

use crate::sessions::encode_cwd;

pub enum Outcome {
    /// Это первый инстанс для данной директории — можно продолжать запуск.
    /// `Receiver` получает сигнал при каждом повторном запуске в той же cwd,
    /// на него нужно подписаться после появления `AppHandle` (см. `lib.rs`).
    Acquired(mpsc::Receiver<()>),
    /// Для этой директории уже есть живой инстанс — ему отправлен сигнал
    /// фокуса, текущий процесс должен завершиться, не создавая окно.
    FocusedExisting,
}

fn socket_path(cwd: &Path) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let name = encode_cwd(&cwd.to_string_lossy());
    Some(home.join(".pi-pine/run").join(format!("{name}.sock")))
}

/// Без домашней директории или при ошибке bind — не блокируем запуск,
/// просто пропускаем dedup для этого процесса (fail-open).
fn acquired_without_dedup() -> Outcome {
    let (_tx, rx) = mpsc::channel();
    Outcome::Acquired(rx)
}

pub fn acquire(cwd: &Path) -> Outcome {
    let Some(sock_path) = socket_path(cwd) else {
        return acquired_without_dedup();
    };

    if let Ok(mut stream) = UnixStream::connect(&sock_path) {
        let _ = stream.write_all(b"focus\n");
        return Outcome::FocusedExisting;
    }

    // Никто не слушает: либо это первый запуск для директории, либо файл
    // сокета — «хвост» от аварийно завершившегося прошлого процесса. В обоих
    // случаях убираем файл (если есть) и биндимся заново.
    if let Some(dir) = sock_path.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return acquired_without_dedup();
        }
    }
    let _ = std::fs::remove_file(&sock_path);

    let listener = match UnixListener::bind(&sock_path) {
        Ok(l) => l,
        Err(_) => return acquired_without_dedup(),
    };

    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            let Ok(mut stream) = conn else { continue };
            let mut buf = [0u8; 16];
            let _ = stream.read(&mut buf);
            // Получатель (главный поток) мог уже исчезнуть при выходе из
            // приложения — игнорируем ошибку отправки.
            let _ = tx.send(());
        }
    });

    Outcome::Acquired(rx)
}
