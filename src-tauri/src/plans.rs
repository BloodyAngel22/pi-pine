//! Plan-mode: файлы планов в `<cwd>/.pi/plans/<sessionId>-<slug>.md`.

use std::path::PathBuf;

fn plans_dir(cwd: &str) -> PathBuf {
    PathBuf::from(cwd).join(".pi").join("plans")
}

fn sanitize_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c);
        } else if c == ' ' || c == '.' {
            out.push('-');
        }
    }
    if out.is_empty() {
        "plan".to_string()
    } else {
        out
    }
}

/// Создаёт каталог планов если нужно, возвращает абсолютный путь к файлу плана.
/// Если файла нет — создаёт его с заголовком-шаблоном.
#[tauri::command]
pub fn ensure_plan_file(cwd: String, session_id: String, slug: String) -> Result<String, String> {
    if cwd.is_empty() {
        return Err("Пустой cwd".into());
    }
    let dir = plans_dir(&cwd);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Создание {:?}: {}", dir, e))?;
    let sid = sanitize_component(&session_id);
    let sl = sanitize_component(&slug);
    let name = if sid == sl {
        format!("{}.md", sid)
    } else {
        format!("{}-{}.md", sid, sl)
    };
    let path = dir.join(&name);
    if !path.exists() {
        let template = format!(
            "# План\n\n_Файл создан pi-pine в режиме планирования._\n\nID сессии: `{}`\n\n## Контекст\n\n- \n\n## Шаги\n\n- [ ] \n\n## Открытые вопросы\n\n- \n",
            session_id
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
    // sanity-check: файл должен быть в каталоге .pi/plans/
    if !p.components().any(|c| c.as_os_str() == ".pi") {
        return Err("Файл плана должен лежать в .pi/plans/".into());
    }
    std::fs::write(&p, text).map_err(|e| e.to_string())
}

/// Список планов в текущем cwd.
#[tauri::command]
pub fn list_plan_files(cwd: String) -> Vec<String> {
    let dir = plans_dir(&cwd);
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
