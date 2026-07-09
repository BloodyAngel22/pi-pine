//! Plan-mode: чтение/ручное редактирование файла плана.
//!
//! Сам файл плана создаёт и удаляет pi-mono-x (RPC-команды `enter_plan_mode`/
//! `exit_plan_mode`, каталог `~/tmp/.pi/plans/`) — pi-pine здесь только читает
//! и сохраняет текст, который показывает пользователю в панели плана.

use std::path::PathBuf;

fn plans_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("tmp").join(".pi").join("plans"))
}

#[tauri::command]
pub fn read_plan_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_plan_file(path: String, text: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let base = plans_dir().ok_or("Не удалось определить домашнюю директорию")?;
    if !p.starts_with(&base) {
        return Err(format!("Файл плана должен лежать в {:?}", base));
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, text).map_err(|e| e.to_string())
}
