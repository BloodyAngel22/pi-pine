//! Поиск бинарника `pi`, чтение состояния `~/.pi/agent/`, watcher `auth.json`.

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
pub struct DirectoryCompletion {
    pub value: String,
    pub label: String,
    pub path: String,
}

fn expand_home(raw: &str) -> PathBuf {
    if raw == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(raw));
    }
    if let Some(rest) = raw.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(raw)
}

#[tauri::command]
pub fn complete_directories(cwd: String, input: String, limit: Option<usize>) -> Result<Vec<DirectoryCompletion>, String> {
    let max = limit.unwrap_or(80).min(200);
    let expanded = expand_home(&input);
    let candidate = if expanded.is_absolute() {
        expanded
    } else {
        PathBuf::from(&cwd).join(expanded)
    };
    let (base_dir, prefix) = if input.ends_with('/') || input.is_empty() {
        (candidate, String::new())
    } else {
        (
            candidate.parent().map(Path::to_path_buf).unwrap_or_else(|| PathBuf::from(&cwd)),
            candidate.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),
        )
    };
    let entries = std::fs::read_dir(&base_dir).map_err(|e| format!("{}: {}", base_dir.display(), e))?;
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if out.len() >= max {
            break;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !prefix.is_empty() && !name.starts_with(&prefix) {
            continue;
        }
        let absolute = entry.path();
        let value = if input.starts_with("~/") || input == "~" {
            if let Some(home) = dirs::home_dir() {
                if let Ok(stripped) = absolute.strip_prefix(home) {
                    format!("~/{}", stripped.to_string_lossy())
                } else {
                    absolute.to_string_lossy().into_owned()
                }
            } else {
                absolute.to_string_lossy().into_owned()
            }
        } else if input.starts_with('/') {
            absolute.to_string_lossy().into_owned()
        } else {
            let cwd_path = PathBuf::from(&cwd);
            absolute
                .strip_prefix(&cwd_path)
                .map(Path::to_path_buf)
                .unwrap_or_else(|_| absolute.clone())
                .to_string_lossy()
                .into_owned()
        };
        out.push(DirectoryCompletion {
            value: format!("{}/", value.trim_end_matches('/')),
            label: format!("{}/", name),
            path: absolute.to_string_lossy().into_owned(),
        });
    }
    out.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(out)
}

/// Возможные пути для поиска `pi` (npm-пакет `@mariozechner/pi-coding-agent`).
fn candidate_paths() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        // nvm-окружения
        let nvm = home.join(".nvm/versions/node");
        if nvm.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&nvm) {
                for e in entries.flatten() {
                    out.push(e.path().join("bin/pi"));
                }
            }
        }
        // volta
        out.push(home.join(".volta/bin/pi"));
        // fnm — стандартный layout
        let fnm = home.join(".local/share/fnm/node-versions");
        if fnm.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&fnm) {
                for e in entries.flatten() {
                    out.push(e.path().join("installation/bin/pi"));
                }
            }
        }
        // npm prefix-овский каталог пользователя
        out.push(home.join(".npm-global/bin/pi"));
        out.push(home.join("node_modules/.bin/pi"));
        out.push(home.join("programming/pi-mono-x/packages/coding-agent/dist/cli.js"));
    }
    if let Ok(current) = std::env::current_dir() {
        if let Some(parent) = current.parent() {
            out.push(parent.join("pi-mono-x/packages/coding-agent/dist/cli.js"));
        }
    }
    // системные
    out.push(PathBuf::from("/usr/local/bin/pi"));
    out.push(PathBuf::from("/usr/bin/pi"));
    out.push(PathBuf::from("/opt/homebrew/bin/pi"));
    out
}

/// Команда: попытаться найти `pi` в PATH и в распространённых местах.
#[tauri::command]
pub fn find_pi_binary() -> Option<String> {
    if let Ok(p) = which::which("pi") {
        return Some(p.to_string_lossy().into_owned());
    }
    for c in candidate_paths() {
        if c.is_file() {
            return Some(c.to_string_lossy().into_owned());
        }
    }
    None
}

#[derive(Serialize, Clone)]
pub struct EnvironmentInfo {
    pub home: Option<String>,
    pub agent_dir: Option<String>,
    pub auth_file: Option<String>,
    pub settings_file: Option<String>,
    pub sessions_dir: Option<String>,
    pub pi_binary: Option<String>,
    pub default_cwd: String,
}

#[tauri::command]
pub fn detect_environment() -> EnvironmentInfo {
    let home = dirs::home_dir();
    let agent_dir = home.as_ref().map(|h| h.join(".pi/agent"));
    let auth_file = agent_dir.as_ref().map(|a| a.join("auth.json"));
    let settings_file = agent_dir.as_ref().map(|a| a.join("settings.json"));
    let sessions_dir = agent_dir.as_ref().map(|a| a.join("sessions"));
    let default_cwd = std::env::current_dir()
        .ok()
        .or_else(|| home.clone())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "/".into());
    EnvironmentInfo {
        home: home.as_ref().map(|h| h.to_string_lossy().into_owned()),
        agent_dir: agent_dir.as_ref().map(|p| p.to_string_lossy().into_owned()),
        auth_file: auth_file.as_ref().map(|p| p.to_string_lossy().into_owned()),
        settings_file: settings_file.as_ref().map(|p| p.to_string_lossy().into_owned()),
        sessions_dir: sessions_dir.as_ref().map(|p| p.to_string_lossy().into_owned()),
        pi_binary: find_pi_binary(),
        default_cwd,
    }
}

#[derive(Serialize, Clone)]
pub struct AuthStatus {
    pub auth_file: Option<String>,
    pub auth_file_exists: bool,
    pub providers: Vec<AuthProviderEntry>,
}

#[derive(Serialize, Clone)]
pub struct AuthProviderEntry {
    pub provider: String,
    pub kind: String, // api_key | oauth | unknown
}

#[tauri::command]
pub fn read_auth_status() -> AuthStatus {
    let env = detect_environment();
    let auth_path = env.auth_file.clone();
    let exists = auth_path
        .as_ref()
        .map(|p| Path::new(p).is_file())
        .unwrap_or(false);
    let mut providers: Vec<AuthProviderEntry> = Vec::new();
    if exists {
        if let Some(p) = &auth_path {
            if let Ok(text) = std::fs::read_to_string(p) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    if let Some(obj) = value.as_object() {
                        for (k, v) in obj {
                            let kind = if v.get("access").is_some() || v.get("refresh").is_some() {
                                "oauth"
                            } else if v.get("api_key").is_some() || v.get("apiKey").is_some() {
                                "api_key"
                            } else {
                                "unknown"
                            };
                            providers.push(AuthProviderEntry {
                                provider: k.clone(),
                                kind: kind.into(),
                            });
                        }
                    }
                }
            }
        }
    }
    AuthStatus {
        auth_file: auth_path,
        auth_file_exists: exists,
        providers,
    }
}

/// Парсинг CLI-аргументов `pi-pine [path]`.
///
/// Поведение в духе VSCode (`code .`, `code ~/projects/foo`):
/// - первый позиционный аргумент трактуется как путь до директории проекта
/// - `.` → текущая директория, из которой запущено приложение
/// - `~/...` → разворачивается в home
/// - относительный путь → разрешается относительно `current_dir` процесса
/// - абсолютный путь → используется как есть
/// - флаги (`--foo`, `-x`) пропускаются
///
/// Возвращает абсолютный путь к существующей директории либо `None`.
#[tauri::command]
pub fn parse_cli_cwd() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let cur = std::env::current_dir().ok();
    for raw in args.into_iter().skip(1) {
        if raw.is_empty() || raw.starts_with('-') {
            continue;
        }
        // Игнорируем тех. аргументы Tauri/webview (на всякий случай)
        if raw.starts_with("--webview") || raw.starts_with("data:") {
            continue;
        }

        let expanded: PathBuf = if raw == "~" {
            match dirs::home_dir() {
                Some(h) => h,
                None => continue,
            }
        } else if let Some(rest) = raw.strip_prefix("~/") {
            match dirs::home_dir() {
                Some(h) => h.join(rest),
                None => continue,
            }
        } else {
            PathBuf::from(&raw)
        };

        let abs = if expanded.is_absolute() {
            expanded
        } else if let Some(c) = &cur {
            c.join(&expanded)
        } else {
            expanded
        };

        // Каноникализация (раскрывает `.` / `..` / симлинки).
        let resolved = abs.canonicalize().unwrap_or(abs);
        if resolved.is_dir() {
            return Some(resolved.to_string_lossy().into_owned());
        }
        // Первый позиционный — но это не директория. Возвращаем None,
        // чтобы фронт мог показать предупреждение и не «съедал» аргумент молча.
        return None;
    }
    None
}

#[tauri::command]
pub fn list_themes() -> Vec<String> {
    if let Some(home) = dirs::home_dir() {
        let dir = home.join(".pi/agent/themes");
        if let Ok(entries) = std::fs::read_dir(&dir) {
            return entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.extension().and_then(|s| s.to_str()) == Some("json") {
                        Some(p.file_stem().unwrap().to_string_lossy().into_owned())
                    } else {
                        None
                    }
                })
                .collect();
        }
    }
    Vec::new()
}

#[tauri::command]
pub fn open_in_default_app(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Путь не найден: {}", path));
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Слушаем изменения `auth.json` и эмитим событие в фронт.
pub fn watch_auth(app: AppHandle) {
    let Some(home) = dirs::home_dir() else { return };
    let agent_dir = home.join(".pi/agent");
    if !agent_dir.is_dir() {
        return;
    }
    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();
    let mut watcher: RecommendedWatcher = match RecommendedWatcher::new(
        move |res| {
            let _ = tx.send(res);
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    ) {
        Ok(w) => w,
        Err(_) => return,
    };
    if watcher
        .watch(&agent_dir, RecursiveMode::NonRecursive)
        .is_err()
    {
        return;
    }
    while let Ok(res) = rx.recv() {
        if let Ok(event) = res {
            let touched = event.paths.iter().any(|p| {
                p.file_name()
                    .map(|n| n == "auth.json")
                    .unwrap_or(false)
            });
            if touched {
                let _ = app.emit("pi://auth-changed", ());
            }
        }
    }
}
