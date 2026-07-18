//! Список недавних workspace (директорий проекта) — единое хранилище recents/pinned
//! для UI-пикера. Не путать с `sessions::read_last_session_file` (последняя открытая
//! сессия внутри cwd) — это независимая, более высокоуровневая запись "какие проекты
//! пользователь открывал и когда".

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceEntry {
    pub path: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub last_used_ms: u64,
    #[serde(default)]
    pub pinned: bool,
}

fn workspaces_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi-pine/workspaces.json"))
}

fn read_workspaces(path: &PathBuf) -> Vec<WorkspaceEntry> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<WorkspaceEntry>>(&text).unwrap_or_default()
}

fn write_workspaces(path: &PathBuf, list: &[WorkspaceEntry]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn normalize_path(path: &str) -> String {
    path.trim_end_matches('/').to_string()
}

fn sort_workspaces(list: &mut Vec<WorkspaceEntry>) {
    list.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.last_used_ms.cmp(&a.last_used_ms)));
}

#[tauri::command]
pub fn list_workspaces() -> Vec<WorkspaceEntry> {
    let Some(path) = workspaces_path() else {
        return Vec::new();
    };
    let mut list = read_workspaces(&path);
    sort_workspaces(&mut list);
    list
}

/// Upsert — обновляет `last_used_ms` (или создаёт запись), вызывается при каждом
/// успешном переключении/открытии workspace (см. `changeCwd` во фронтенде).
#[tauri::command]
pub fn touch_workspace(path: String) -> Result<WorkspaceEntry, String> {
    let norm = normalize_path(&path);
    if norm.is_empty() {
        return Err("Пустой путь".into());
    }
    let file = workspaces_path().ok_or("Нет домашней директории")?;
    let mut list = read_workspaces(&file);
    let entry = if let Some(existing) = list.iter_mut().find(|w| w.path == norm) {
        existing.last_used_ms = now_ms();
        existing.clone()
    } else {
        let e = WorkspaceEntry {
            path: norm,
            display_name: None,
            last_used_ms: now_ms(),
            pinned: false,
        };
        list.push(e.clone());
        e
    };
    write_workspaces(&file, &list)?;
    Ok(entry)
}

/// Убирает запись из списка недавних. Файлы сессий на диске не трогает.
#[tauri::command]
pub fn remove_workspace(path: String) -> Result<(), String> {
    let norm = normalize_path(&path);
    let file = workspaces_path().ok_or("Нет домашней директории")?;
    let mut list = read_workspaces(&file);
    list.retain(|w| w.path != norm);
    write_workspaces(&file, &list)
}

#[tauri::command]
pub fn set_workspace_pinned(path: String, pinned: bool) -> Result<(), String> {
    let norm = normalize_path(&path);
    let file = workspaces_path().ok_or("Нет домашней директории")?;
    let mut list = read_workspaces(&file);
    let Some(w) = list.iter_mut().find(|w| w.path == norm) else {
        return Err("Workspace не найден в списке недавних".into());
    };
    w.pinned = pinned;
    write_workspaces(&file, &list)
}

#[tauri::command]
pub fn rename_workspace(path: String, display_name: Option<String>) -> Result<(), String> {
    let norm = normalize_path(&path);
    let file = workspaces_path().ok_or("Нет домашней директории")?;
    let mut list = read_workspaces(&file);
    let Some(w) = list.iter_mut().find(|w| w.path == norm) else {
        return Err("Workspace не найден в списке недавних".into());
    };
    w.display_name = display_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    write_workspaces(&file, &list)
}
