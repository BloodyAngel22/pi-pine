//! Единый (глобальный) single-instance lock для всего приложения.
//!
//! Механизм: unix-сокет `~/.pi-pine/run/main.sock`. Повторный запуск pi-pine
//! (с любым путём или вовсе без него) подключается к существующему сокету,
//! шлёт JSON-сообщение `{"cmd":"open_workspace","path":"<path or empty>"}` и
//! завершается — вместо открытия второго окна/процесса. Первый (единственный)
//! инстанс слушает сокет и транслирует каждое такое сообщение в событие для
//! фронтенда (см. `lib.rs`), который переключает активный workspace внутри уже
//! открытого окна.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc;

#[derive(Serialize, Deserialize)]
struct OpenWorkspaceMsg {
    cmd: String,
    #[serde(default)]
    path: String,
}

pub enum Outcome {
    /// Это первый (единственный) инстанс — можно продолжать запуск. `Receiver`
    /// получает путь при каждом повторном запуске приложения (пустая строка —
    /// просто фокус без переключения workspace); подписаться нужно после
    /// появления `AppHandle` (см. `lib.rs`).
    Acquired(mpsc::Receiver<String>),
    /// Уже есть живой инстанс — ему передан путь для переключения/фокуса,
    /// текущий процесс должен завершиться, не создавая окно.
    HandedOff,
}

fn socket_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join(".pi-pine/run/main.sock"))
}

/// Без домашней директории или при ошибке bind — не блокируем запуск,
/// просто пропускаем dedup для этого процесса (fail-open).
fn acquired_without_dedup() -> Outcome {
    let (_tx, rx) = mpsc::channel();
    Outcome::Acquired(rx)
}

pub fn acquire(cwd: Option<&Path>) -> Outcome {
    let Some(sock_path) = socket_path() else {
        return acquired_without_dedup();
    };

    let path_str = cwd
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();

    if let Ok(mut stream) = UnixStream::connect(&sock_path) {
        let msg = OpenWorkspaceMsg {
            cmd: "open_workspace".into(),
            path: path_str,
        };
        if let Ok(json) = serde_json::to_string(&msg) {
            let _ = stream.write_all(json.as_bytes());
            let _ = stream.write_all(b"\n");
        }
        return Outcome::HandedOff;
    }

    // Никто не слушает: либо это первый запуск, либо файл сокета — «хвост» от
    // аварийно завершившегося прошлого процесса. В обоих случаях убираем
    // файл (если есть) и биндимся заново.
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
            let mut buf = String::new();
            if stream.read_to_string(&mut buf).is_err() {
                continue;
            }
            let path = serde_json::from_str::<OpenWorkspaceMsg>(buf.trim())
                .map(|m| m.path)
                .unwrap_or_default();
            // Получатель (главный поток) мог уже исчезнуть при выходе из
            // приложения — игнорируем ошибку отправки.
            let _ = tx.send(path);
        }
    });

    Outcome::Acquired(rx)
}
