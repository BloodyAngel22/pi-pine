//! Plan-mode: файлы планов в `/tmp/.pi/plans/<uuid>.md`.

use std::path::PathBuf;

fn plans_dir() -> PathBuf {
    std::env::temp_dir().join(".pi").join("plans")
}

/// Создаёт каталог планов если нужно, возвращает абсолютный путь к файлу плана.
/// Принимает UUID (генерируется на фронтенде) для имени файла.
/// Если файла нет — создаёт его с заголовком-шаблоном.
/// Если файл уже существует — возвращает путь к нему.
#[tauri::command]
pub fn ensure_plan_file(uuid: String) -> Result<String, String> {
    let dir = plans_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Создание {:?}: {}", dir, e))?;
    let name = format!("{}.md", uuid);
    let path = dir.join(&name);
    if !path.exists() {
        let template = String::from(
            "# План\n\n_Файл создан pi-pine в режиме планирования._\n\n## Контекст\n\n- \n\n## Шаги\n\n- [ ] \n\n## Открытые вопросы\n\n- \n",
        );
        std::fs::write(&path, template).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
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
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let base = plans_dir();
    if !p.starts_with(&base) {
        return Err("Файл плана должен лежать в /tmp/.pi/plans/".into());
    }
    std::fs::write(&p, text).map_err(|e| e.to_string())
}

/// Список планов в текущем cwd.
#[tauri::command]
pub fn list_plan_files(cwd: String) -> Vec<String> {
    let _ = cwd;
    let dir = plans_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("md") {
                Some(p.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect();
    out.sort();
    out
}
