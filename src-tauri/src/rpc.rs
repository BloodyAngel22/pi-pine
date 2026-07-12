//! Мост к `pi --mode rpc`. Один процесс на приложение, JSONL по stdin/stdout.

use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::paths::find_pi_binary;
use crate::rpc_log;

/// Лимит размера одного лог-файла RPC-трафика — после него дальнейшие
/// строки этого процесса больше не логируются (без ротации, см. rpc_log.rs).
const RPC_LOG_MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Default)]
pub struct RpcManager {
    inner: Mutex<Option<RpcInstance>>,
    app: Mutex<Option<AppHandle>>,
    log_writer: Mutex<Option<File>>,
}

struct RpcInstance {
    child: Child,
    stdin: ChildStdin,
    generation: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RpcStartArgs {
    pub cli_path: Option<String>,
    pub cwd: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    /// Опциональный стартовый файл сессии для возобновления.
    pub session_file: Option<String>,
    /// Дополнительные переменные окружения.
    pub env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Serialize, Clone)]
pub struct RpcStartResult {
    pub generation: u64,
    pub pi_path: String,
}

#[derive(Serialize, Clone)]
pub struct RpcStatusResult {
    pub running: bool,
    pub generation: u64,
}

impl RpcManager {
    pub fn new(app: AppHandle) -> Self {
        Self {
            inner: Mutex::new(None),
            app: Mutex::new(Some(app)),
            log_writer: Mutex::new(None),
        }
    }

    fn app(&self) -> Option<AppHandle> {
        self.app.lock().ok()?.clone()
    }
}

/// Пишет одну строку RPC-трафика в лог-файл, если логирование включено.
/// direction: '>' — исходящая (в stdin pi), '<' — входящая (из stdout/stderr pi).
fn log_line(writer: &Mutex<Option<File>>, direction: char, line: &str) {
    let mut guard = writer.lock().unwrap();
    let Some(file) = guard.as_mut() else { return };
    if let Ok(meta) = file.metadata() {
        if meta.len() > RPC_LOG_MAX_BYTES {
            let _ = writeln!(file, "--- log truncated: size limit reached ---");
            *guard = None;
            return;
        }
    }
    let _ = writeln!(file, "{} {}", direction, line);
}

static ANSI_RE: Lazy<Regex> = Lazy::new(|| {
    // CSI / OSC последовательности
    Regex::new(r"\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)").unwrap()
});
static CTRL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]").unwrap());

fn sanitize_line(s: &str) -> String {
    let cleaned = ANSI_RE.replace_all(s, "");
    let cleaned = CTRL_RE.replace_all(&cleaned, "");
    let trimmed = cleaned.trim();
    if let Some(idx) = trimmed.find('{') {
        if idx > 0 {
            return trimmed[idx..].to_string();
        }
    }
    trimmed.to_string()
}

fn is_jsonish(s: &str) -> bool {
    let s = s.trim_start();
    s.starts_with('{') || s.starts_with('[')
}

#[tauri::command]
pub fn rpc_start(
    args: RpcStartArgs,
    state: tauri::State<'_, Arc<RpcManager>>,
    app: AppHandle,
) -> Result<RpcStartResult, String> {
    // Если уже запущен — погасим
    rpc_stop(state.clone())?;
    let pi_path = args
        .cli_path
        .clone()
        .or_else(find_pi_binary)
        .ok_or_else(|| "Бинарник pi не найден".to_string())?;

    let cwd_path = PathBuf::from(&args.cwd);
    if !cwd_path.is_dir() {
        return Err(format!("Каталог не найден: {}", args.cwd));
    }

    let mut cmd = Command::new(&pi_path);
    cmd.arg("--mode").arg("rpc");
    if let Some(p) = &args.provider {
        if !p.is_empty() {
            cmd.arg("--provider").arg(p);
        }
    }
    if let Some(m) = &args.model {
        if !m.is_empty() {
            cmd.arg("--model").arg(m);
        }
    }
    if let Some(s) = &args.session_file {
        if !s.is_empty() {
            cmd.arg("--session").arg(s);
        }
    }
    cmd.current_dir(&cwd_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // pi-mono-x (Node/Bun) по умолчанию заводит фоновые пулы потоков (libuv,
    // V8) размером в число логических ядер. Процесс `pi --mode rpc` живёт
    // всё время сессии и реально нагружает CPU (tool calls, subagents), так
    // что без ограничения он вместе с самим pi-pine выедал все ядра машины.
    // Ограничиваем половиной — значения ниже переопределяемы через args.env.
    let half_cpus = std::thread::available_parallelism()
        .map(|n| n.get() / 2)
        .unwrap_or(4)
        .max(2);
    cmd.env("UV_THREADPOOL_SIZE", half_cpus.to_string());
    cmd.env("NODE_OPTIONS", format!("--v8-pool-size={half_cpus}"));
    if let Some(extra) = &args.env {
        for (k, v) in extra {
            cmd.env(k, v);
        }
    }
    // Подавляем интерактивные TTY-фокусы
    cmd.env("PI_NO_TTY", "1");
    cmd.env("NO_COLOR", "1");
    // pi-pine сам показывает нативное OS-уведомление на agent_end (см. src/lib/notify.ts) —
    // просим pi-mono-x не дублировать визуальное уведомление (звук всё равно проигрывается).
    cmd.env("PI_RPC_CLIENT_NOTIFIES", "1");

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить pi: {}", e))?;
    let stdout = child.stdout.take().ok_or("нет stdout")?;
    let stderr = child.stderr.take().ok_or("нет stderr")?;
    let stdin = child.stdin.take().ok_or("нет stdin")?;

    let generation = {
        let mut guard = state.inner.lock().unwrap();
        let gen = guard.as_ref().map(|i| i.generation + 1).unwrap_or(1);
        *guard = Some(RpcInstance {
            child,
            stdin,
            generation: gen,
        });
        gen
    };

    // Открываем лог-файл RPC-трафика, если включено в настройках
    // (~/.pi-pine/rpc_log_config.json) — по одному файлу на generation.
    {
        let log_file = if rpc_log::get_rpc_log_config().enabled {
            rpc_log::logs_dir().and_then(|dir| {
                std::fs::create_dir_all(&dir).ok()?;
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .ok()?
                    .as_secs();
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(dir.join(format!("rpc-{}-gen{}.jsonl", ts, generation)))
                    .ok()
            })
        } else {
            None
        };
        *state.log_writer.lock().unwrap() = log_file;
    }

    // Reader stdout
    {
        let app = app.clone();
        let gen = generation;
        let manager = state.inner().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let cleaned = sanitize_line(&line);
                if cleaned.is_empty() {
                    continue;
                }
                if !is_jsonish(&cleaned) {
                    log_line(&manager.log_writer, '<', &cleaned);
                    let _ = app.emit(
                        "rpc://stderr",
                        serde_json::json!({ "generation": gen, "line": cleaned }),
                    );
                    continue;
                }
                log_line(&manager.log_writer, '<', &cleaned);
                let _ = app.emit(
                    "rpc://line",
                    serde_json::json!({ "generation": gen, "line": cleaned }),
                );
            }
            let _ = app.emit(
                "rpc://closed",
                serde_json::json!({ "generation": gen, "reason": "stdout-eof" }),
            );
        });
    }
    // Reader stderr
    {
        let app = app.clone();
        let gen = generation;
        let manager = state.inner().clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let cleaned = sanitize_line(&line);
                if cleaned.is_empty() {
                    continue;
                }
                log_line(&manager.log_writer, '<', &cleaned);
                let _ = app.emit(
                    "rpc://stderr",
                    serde_json::json!({ "generation": gen, "line": cleaned }),
                );
            }
        });
    }

    // Сообщим фронту, что инстанс готов
    let _ = state.app().map(|a| {
        a.emit(
            "rpc://started",
            serde_json::json!({ "generation": generation }),
        )
    });

    Ok(RpcStartResult {
        generation,
        pi_path,
    })
}

#[tauri::command]
pub fn rpc_send(line: String, state: tauri::State<'_, Arc<RpcManager>>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    let inst = guard.as_mut().ok_or_else(|| "RPC не запущен".to_string())?;
    let mut buf = line;
    if !buf.ends_with('\n') {
        buf.push('\n');
    }
    inst.stdin
        .write_all(buf.as_bytes())
        .map_err(|e| format!("Запись в stdin: {}", e))?;
    inst.stdin
        .flush()
        .map_err(|e| format!("Flush stdin: {}", e))?;
    drop(guard);
    log_line(&state.log_writer, '>', buf.trim_end());
    Ok(())
}

#[tauri::command]
pub fn rpc_stop(state: tauri::State<'_, Arc<RpcManager>>) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    if let Some(mut inst) = guard.take() {
        let _ = inst.child.kill();
        let _ = inst.child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn rpc_status(state: tauri::State<'_, Arc<RpcManager>>) -> RpcStatusResult {
    let mut guard = state.inner.lock().unwrap();
    if let Some(inst) = guard.as_mut() {
        // Проверим, не помер ли
        match inst.child.try_wait() {
            Ok(Some(_)) => {
                let gen = inst.generation;
                *guard = None;
                return RpcStatusResult {
                    running: false,
                    generation: gen,
                };
            }
            _ => {
                return RpcStatusResult {
                    running: true,
                    generation: inst.generation,
                };
            }
        }
    }
    RpcStatusResult {
        running: false,
        generation: 0,
    }
}
