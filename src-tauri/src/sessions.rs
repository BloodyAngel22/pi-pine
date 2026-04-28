//! Листинг файлов сессий из `~/.pi/agent/sessions/<encoded-cwd>/`.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Кодирование cwd → имя каталога: `/home/maximz/foo` → `--home-maximz-foo--`.
/// Эмпирически наблюдается в существующих сессиях pi (см. `~/.pi/agent/sessions`).
fn encode_cwd(cwd: &str) -> String {
    let trimmed = cwd.trim_end_matches('/');
    let body: String = trimmed
        .chars()
        .map(|c| if c == '/' { '-' } else { c })
        .collect();
    format!("--{}--", body.trim_start_matches('-'))
}

#[derive(Serialize, Clone)]
pub struct SessionInfo {
    pub file: String,
    pub session_id: String,
    pub timestamp: Option<String>,
    pub cwd: Option<String>,
    pub name: Option<String>,
    pub message_count: usize,
    pub first_user_text: Option<String>,
    pub last_modified_secs: u64,
    pub size_bytes: u64,
}

#[derive(Deserialize)]
struct SessionHeader {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    timestamp: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default, rename = "sessionName")]
    session_name: Option<String>,
}

#[derive(Deserialize)]
struct GenericLine {
    #[serde(default, rename = "type")]
    kind: Option<String>,
    #[serde(default)]
    message: Option<MessageInner>,
}

#[derive(Deserialize)]
struct MessageInner {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    content: Option<serde_json::Value>,
}

fn read_first_user_text(path: &Path, max_lines: usize) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let f = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(f);
    for (i, line) in reader.lines().enumerate() {
        if i >= max_lines {
            break;
        }
        let Ok(line) = line else { continue };
        let Ok(g): Result<GenericLine, _> = serde_json::from_str(&line) else {
            continue;
        };
        if g.kind.as_deref() == Some("message") {
            let Some(m) = g.message else { continue };
            if m.role.as_deref() != Some("user") {
                continue;
            }
            if let Some(content) = m.content {
                return extract_text(&content);
            }
        }
    }
    None
}

fn extract_text(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Array(arr) => {
            let mut buf = String::new();
            for item in arr {
                if let Some(t) = item.get("text").and_then(|x| x.as_str()) {
                    if !buf.is_empty() {
                        buf.push('\n');
                    }
                    buf.push_str(t);
                }
            }
            if buf.is_empty() {
                None
            } else {
                Some(buf)
            }
        }
        _ => None,
    }
}

fn read_header(path: &Path) -> Option<SessionHeader> {
    use std::io::{BufRead, BufReader};
    let f = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(f);
    let first = reader.lines().next()?.ok()?;
    serde_json::from_str(&first).ok()
}

/// Сканируем первые `max_lines` строк, ищем самое свежее `sessionName`
/// (в header, либо в записях вида `{"type":"metadata","sessionName":"..."}`).
fn read_session_name_scan(path: &Path, max_lines: usize) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let f = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(f);
    let mut latest: Option<String> = None;
    for (i, line) in reader.lines().enumerate() {
        if i >= max_lines {
            break;
        }
        let Ok(line) = line else { continue };
        let Ok(v): Result<serde_json::Value, _> = serde_json::from_str(&line) else {
            continue;
        };
        // header-вариант: {"sessionName": "..."}
        if let Some(s) = v.get("sessionName").and_then(|x| x.as_str()) {
            if !s.is_empty() {
                latest = Some(s.to_string());
            }
        }
        // metadata-запись с обновлением имени
        if v.get("type").and_then(|x| x.as_str()) == Some("metadata") {
            if let Some(s) = v.get("sessionName").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    latest = Some(s.to_string());
                }
            }
        }
    }
    latest
}

fn count_messages(path: &Path) -> usize {
    use std::io::{BufRead, BufReader};
    let Ok(f) = std::fs::File::open(path) else {
        return 0;
    };
    let reader = BufReader::new(f);
    let mut n = 0;
    for line in reader.lines().flatten() {
        if let Ok(g) = serde_json::from_str::<GenericLine>(&line) {
            if g.kind.as_deref() == Some("message") {
                n += 1;
            }
        }
    }
    n
}

#[tauri::command]
pub fn list_project_sessions(cwd: String) -> Vec<SessionInfo> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    let dir: PathBuf = home.join(".pi/agent/sessions").join(encode_cwd(&cwd));
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<SessionInfo> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
                return None;
            }
            let meta = e.metadata().ok()?;
            let header = read_header(&path);
            let scanned_name = read_session_name_scan(&path, 200);
            let first_user = read_first_user_text(&path, 50);
            let count = count_messages(&path);
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let session_id = header
                .as_ref()
                .and_then(|h| h.id.clone())
                .or_else(|| {
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            Some(SessionInfo {
                file: path.to_string_lossy().into_owned(),
                session_id,
                timestamp: header.as_ref().and_then(|h| h.timestamp.clone()),
                cwd: header.as_ref().and_then(|h| h.cwd.clone()),
                name: scanned_name
                    .clone()
                    .or_else(|| header.as_ref().and_then(|h| h.session_name.clone())),
                message_count: count,
                first_user_text: first_user,
                last_modified_secs: mtime,
                size_bytes: meta.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.last_modified_secs.cmp(&a.last_modified_secs));
    out
}

#[tauri::command]
pub fn delete_session_file(file: String) -> Result<(), String> {
    let p = PathBuf::from(&file);
    // sanity: должен лежать внутри ~/.pi/agent/sessions
    if let Some(home) = dirs::home_dir() {
        let base = home.join(".pi/agent/sessions");
        if !p.starts_with(&base) {
            return Err("Файл вне каталога сессий".into());
        }
    }
    std::fs::remove_file(&p).map_err(|e| e.to_string())
}

/// Переименовать сессию: дописать metadata-строку с новым именем в конец JSONL,
/// а если первая строка — JSON-объект, обновить в ней `sessionName` (best-effort).
/// Безопасно работает с любой сессией (активной/неактивной).
#[tauri::command]
pub fn rename_session_file(file: String, name: String) -> Result<(), String> {
    let p = PathBuf::from(&file);
    if let Some(home) = dirs::home_dir() {
        let base = home.join(".pi/agent/sessions");
        if !p.starts_with(&base) {
            return Err("Файл вне каталога сессий".into());
        }
    }
    if !p.is_file() {
        return Err("Файл сессии не найден".into());
    }
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err("Пустое имя".into());
    }

    // 1) Перечитываем все строки.
    let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    // 2) Если первая строка — JSON-объект, обновляем sessionName в ней.
    let mut header_updated = false;
    if let Some(first) = lines.first_mut() {
        if let Ok(serde_json::Value::Object(mut obj)) = serde_json::from_str(first) {
            obj.insert(
                "sessionName".to_string(),
                serde_json::Value::String(trimmed.clone()),
            );
            if let Ok(s) = serde_json::to_string(&serde_json::Value::Object(obj)) {
                *first = s;
                header_updated = true;
            }
        }
    }

    // 3) В любом случае добавляем metadata-запись в конец — это
    // совместимый с pi механизм пометить именем (читается scan-ом).
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let meta = serde_json::json!({
        "type": "metadata",
        "sessionName": trimmed,
        "ts": now,
        "source": "pi-pine"
    });
    lines.push(meta.to_string());

    // 4) Атомарно перезаписываем (через временный файл).
    let tmp = p.with_extension("jsonl.tmp");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        for l in &lines {
            f.write_all(l.as_bytes()).map_err(|e| e.to_string())?;
            f.write_all(b"\n").map_err(|e| e.to_string())?;
        }
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;

    let _ = header_updated;
    Ok(())
}

/// Обрезает JSONL-файл сессии до строки, содержащей указанный entryId
/// (включительно). Все строки после неё удаляются.
/// Перед записью создаётся резервная копия `<file>.bak`.
///
/// Используется для in-place «Регенерировать» и «Редактировать»:
/// RPC останавливается до вызова, затем перезапускается на том же файле.
#[tauri::command]
pub fn truncate_session_at(file: String, entry_id: String) -> Result<(), String> {
    let p = PathBuf::from(&file);
    // Безопасность: только файлы внутри ~/.pi/agent/sessions
    if let Some(home) = dirs::home_dir() {
        let base = home.join(".pi/agent/sessions");
        if !p.starts_with(&base) {
            return Err("Файл вне каталога сессий".into());
        }
    }
    if !p.is_file() {
        return Err("Файл сессии не найден".into());
    }
    if entry_id.trim().is_empty() {
        return Err("entry_id пустой".into());
    }

    let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();

    // Ищем строку, в которой встречается entry_id.
    // pi хранит id в нескольких местах; просто ищем вхождение строки —
    // надёжнее парсинга нескольких форматов.
    let target = format!("\"{}\"", entry_id);
    let cut_idx = lines.iter().position(|l| l.contains(&target));
    let Some(cut) = cut_idx else {
        return Err(format!("Строка с entryId «{}» не найдена", entry_id));
    };

    // Берём строки 0..=cut (включительно).
    let kept: Vec<&str> = lines[..=cut].to_vec();

    // Бэкап.
    let bak = p.with_extension("jsonl.bak");
    std::fs::copy(&p, &bak).map_err(|e| format!("Backup: {}", e))?;

    // Атомарная запись через временный файл.
    let tmp = p.with_extension("jsonl.tmp");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        for l in &kept {
            f.write_all(l.as_bytes()).map_err(|e| e.to_string())?;
            f.write_all(b"\n").map_err(|e| e.to_string())?;
        }
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;

    Ok(())
}
