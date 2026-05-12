use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

static NEXT_TERMINAL_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct TerminalManager {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    master: Box<dyn MasterPty + Send>,
    meta: TerminalInfo,
}

#[derive(Serialize, Clone)]
pub struct TerminalInfo {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub pid: Option<u32>,
}

#[derive(Deserialize)]
pub struct TerminalSpawnArgs {
    pub cwd: String,
    pub name: Option<String>,
    pub shell: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Deserialize)]
pub struct TerminalWriteArgs {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Deserialize)]
pub struct TerminalResizeArgs {
    pub terminal_id: String,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Deserialize)]
pub struct TerminalKillArgs {
    pub terminal_id: String,
}

fn default_shell() -> String {
    std::env::var("SHELL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string())
}

#[tauri::command]
pub fn terminal_spawn(
    args: TerminalSpawnArgs,
    state: tauri::State<'_, Arc<TerminalManager>>,
    app: AppHandle,
) -> Result<TerminalInfo, String> {
    let cwd = PathBuf::from(&args.cwd);
    if !cwd.is_dir() {
        return Err(format!("Каталог не найден: {}", args.cwd));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: args.rows.unwrap_or(24).max(2),
            cols: args.cols.unwrap_or(80).max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Не удалось создать PTY: {}", e))?;

    let shell = args.shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(shell);
    cmd.cwd(cwd.as_os_str());
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Не удалось запустить shell: {}", e))?;
    let pid = child.process_id();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Не удалось открыть reader PTY: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Не удалось открыть writer PTY: {}", e))?;

    let id = format!("term-{}", NEXT_TERMINAL_ID.fetch_add(1, Ordering::Relaxed));
    let info = TerminalInfo {
        id: id.clone(),
        name: args.name.unwrap_or_else(|| "Terminal".to_string()),
        cwd: args.cwd,
        pid,
    };

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            id.clone(),
            TerminalSession {
                writer: Mutex::new(writer),
                child: Mutex::new(child),
                master: pair.master,
                meta: info.clone(),
            },
        );
    }

    let manager = state.inner().clone();
    std::thread::spawn({
        let id = id.clone();
        move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(
                            "terminal://data",
                            serde_json::json!({ "id": id, "data": data }),
                        );
                    }
                    Err(_) => break,
                }
            }
            let mut exit_code = None;
            if let Some(session) = manager.sessions.lock().unwrap().remove(&id) {
                if let Ok(mut child) = session.child.lock() {
                    if let Ok(Some(status)) = child.try_wait() {
                        exit_code = Some(status.exit_code());
                    }
                }
            }
            let _ = app.emit(
                "terminal://exit",
                serde_json::json!({ "id": id, "exitCode": exit_code }),
            );
        }
    });

    Ok(info)
}

#[tauri::command]
pub fn terminal_write(
    args: TerminalWriteArgs,
    state: tauri::State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get(&args.terminal_id)
        .ok_or_else(|| "Терминал не найден".to_string())?;
    let mut writer = session.writer.lock().unwrap();
    writer
        .write_all(args.data.as_bytes())
        .map_err(|e| format!("Не удалось записать в терминал: {}", e))?;
    writer
        .flush()
        .map_err(|e| format!("Не удалось сбросить writer терминала: {}", e))
}

#[tauri::command]
pub fn terminal_resize(
    args: TerminalResizeArgs,
    state: tauri::State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions
        .get(&args.terminal_id)
        .ok_or_else(|| "Терминал не найден".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: args.rows.max(2),
            cols: args.cols.max(2),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Не удалось изменить размер терминала: {}", e))
}

#[tauri::command]
pub fn terminal_kill(
    args: TerminalKillArgs,
    state: tauri::State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    let session = state.sessions.lock().unwrap().remove(&args.terminal_id);
    if let Some(session) = session {
        let mut child = session.child.lock().unwrap();
        child
            .kill()
            .map_err(|e| format!("Не удалось остановить терминал: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn terminal_list(
    state: tauri::State<'_, Arc<TerminalManager>>,
) -> Result<Vec<TerminalInfo>, String> {
    let sessions = state.sessions.lock().unwrap();
    Ok(sessions.values().map(|s| s.meta.clone()).collect())
}
