//! Листинг файлов сессий из `~/.pi/agent/sessions/<encoded-cwd>/`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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

/// Сканируем ВСЮ сессию (без ограничения по строкам — переименование может
/// случиться в любой момент долгого разговора, а не только в начале файла)
/// и ищем самое свежее имя сессии. Побеждает запись, встреченная позже по
/// порядку строк — так же, как `SessionManager.getSessionName()` в самом pi
/// берёт последнюю `session_info`-запись.
///
/// Поддерживаем:
///  - нативный формат pi: `{"type":"session_info","name":"..."}` — это то,
///    что реально пишет `rpc set_session_name` (см. session-manager.ts
///    `appendSessionInfo`/`getSessionName`). Пустое имя здесь — явный сброс
///    заголовка сессии (как и в самом pi), поэтому сбрасывает `latest`.
///  - legacy pi-pine формат (`rename_session_file` до этого фикса):
///    `{"type":"metadata","sessionName":"..."}` и `sessionName` прямо в
///    первой строке — оставлено для обратной совместимости со старыми
///    переименованиями.
fn read_session_name_scan(path: &Path) -> Option<String> {
    use std::io::{BufRead, BufReader};
    let f = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(f);
    let mut latest: Option<String> = None;
    for line in reader.lines() {
        let Ok(line) = line else { continue };
        let Ok(v): Result<serde_json::Value, _> = serde_json::from_str(&line) else {
            continue;
        };
        match v.get("type").and_then(|x| x.as_str()) {
            Some("session_info") => {
                let name = v
                    .get("name")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                latest = if name.is_empty() { None } else { Some(name) };
            }
            Some("metadata") => {
                if let Some(s) = v.get("sessionName").and_then(|x| x.as_str()) {
                    if !s.is_empty() {
                        latest = Some(s.to_string());
                    }
                }
            }
            _ => {
                if let Some(s) = v.get("sessionName").and_then(|x| x.as_str()) {
                    if !s.is_empty() {
                        latest = Some(s.to_string());
                    }
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
            let scanned_name = read_session_name_scan(&path);
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

fn last_sessions_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi/pine-last-sessions.json"))
}

fn read_last_sessions_map(path: &Path) -> HashMap<String, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return HashMap::new();
    };
    serde_json::from_str::<HashMap<String, String>>(&text).unwrap_or_default()
}

#[tauri::command]
pub fn read_last_session_file(cwd: String) -> Option<String> {
    let path = last_sessions_path()?;
    let map = read_last_sessions_map(&path);
    let file = map.get(&cwd)?.clone();
    if PathBuf::from(&file).is_file() {
        Some(file)
    } else {
        None
    }
}

#[tauri::command]
pub fn write_last_session_file(cwd: String, session_file: String) -> Result<(), String> {
    if cwd.trim().is_empty() || session_file.trim().is_empty() {
        return Ok(());
    }
    let path = last_sessions_path().ok_or("no home")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut map = read_last_sessions_map(&path);
    map.insert(cwd, session_file);
    let text = serde_json::to_string_pretty(&map).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
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

/// Григорианская дата (год, месяц, день) по числу дней от unix-эпохи.
/// Алгоритм Howard Hinnant (civil_from_days), см.
/// http://howardhinnant.github.io/date_algorithms.html
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097); // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// ISO8601 UTC-таймстамп в том же формате, что и `new Date().toISOString()`
/// в pi — нужен для совместимости с полем `timestamp` у session-записей.
fn iso8601_now() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let millis = now.subsec_millis();
    let days = secs.div_euclid(86400);
    let secs_of_day = secs.rem_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    let h = secs_of_day / 3600;
    let mi = (secs_of_day % 3600) / 60;
    let s = secs_of_day % 60;
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}.{millis:03}Z")
}

/// Короткий id в формате pi (`generateId()` в session-manager.ts — 8 hex
/// символов, коллизия проверяется по уже встреченным id в файле).
fn generate_entry_id(existing_ids: &std::collections::HashSet<String>) -> String {
    use std::hash::{Hash, Hasher};
    for salt in 0u64..100 {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        std::time::SystemTime::now().hash(&mut hasher);
        std::process::id().hash(&mut hasher);
        salt.hash(&mut hasher);
        let id = format!("{:08x}", (hasher.finish() & 0xffff_ffff) as u32);
        if !existing_ids.contains(&id) {
            return id;
        }
    }
    format!(
        "{:016x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    )
}

/// Переименовать сессию: дописывает НАСТОЯЩУЮ `session_info`-запись —
/// именно тот формат, что пишет сам pi через RPC `set_session_name`
/// (`SessionManager.appendSessionInfo` в pi-mono-x). Раньше здесь писался
/// pi-pine-специфичный `{"type":"metadata","sessionName":...}`, который pi
/// не понимает и не читает — из-за этого имя, заданное для активной
/// вкладки, никогда не попадало в общий список сессий. Теперь оба пути
/// (эта команда для холодных/неактивных сессий и `rpc set_session_name`
/// для загруженных) пишут один и тот же формат.
///
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

    let content = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();

    // Вычисляем parentId так же, как это сделал бы сам pi
    // (SessionManager.leafId): id последней "настоящей" записи, либо
    // targetId последнего session_leaf-маркера, если он новее (т.е.
    // пользователь до этого переключался на другую ветку дерева).
    let mut existing_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut last_entry_id: Option<String> = None;
    let mut last_leaf_target: Option<String> = None;
    for line in &lines {
        let Ok(v): Result<serde_json::Value, _> = serde_json::from_str(line) else {
            continue;
        };
        if let Some(id) = v.get("id").and_then(|x| x.as_str()) {
            existing_ids.insert(id.to_string());
        }
        match v.get("type").and_then(|x| x.as_str()) {
            Some("session") => {}
            Some("session_leaf") => {
                last_leaf_target = v
                    .get("targetId")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
            }
            Some(_) => {
                last_entry_id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string());
                last_leaf_target = None;
            }
            None => {}
        }
    }
    let parent_id = last_leaf_target.or(last_entry_id);
    let entry_id = generate_entry_id(&existing_ids);

    let entry = serde_json::json!({
        "type": "session_info",
        "id": entry_id,
        "parentId": parent_id,
        "timestamp": iso8601_now(),
        "name": trimmed,
    });

    // Атомарно дописываем строку в конец (через временный файл).
    let tmp = p.with_extension("jsonl.tmp");
    {
        use std::io::Write;
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        for l in &lines {
            f.write_all(l.as_bytes()).map_err(|e| e.to_string())?;
            f.write_all(b"\n").map_err(|e| e.to_string())?;
        }
        f.write_all(entry.to_string().as_bytes())
            .map_err(|e| e.to_string())?;
        f.write_all(b"\n").map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;

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

    // Берём строки 0..cut (НЕ включая найденную строку),
    // чтобы caller мог передать id редактируемого сообщения
    // и получить сессию без него и всего последующего.
    let kept: Vec<&str> = lines[..cut].to_vec();

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
