use tauri::command;

/// Читает `text/uri-list` из системного буфера обмена и возвращает
/// список абсолютных путей к файлам.
///
/// Приоритет:
///   1. `wl-paste -t text/uri-list` (Wayland) — валидирует существование файлов
///   2. `xclip -o -selection clipboard -t text/uri-list` (X11) — валидирует
///   3. `arboard::Clipboard::file_list()` (Rust, работает и на Wayland, и на X11)
///   4. `arboard::Clipboard::get_text()` (Rust, fallback — один файл)
#[command]
pub async fn read_clipboard_uri_list() -> Vec<String> {
    // 1) Wayland: wl-paste
    if let Ok(output) = std::process::Command::new("wl-paste")
        .args(["-t", "text/uri-list"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let paths: Vec<String> = stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| l.starts_with("file://"))
                .map(|l| decode_file_uri(&l))
                .filter(|p| std::path::Path::new(p).exists())
                .collect();
            if !paths.is_empty() {
                return paths;
            }
        }
    }

    // 2) X11: xclip
    if let Ok(output) = std::process::Command::new("xclip")
        .args(["-o", "-selection", "clipboard", "-t", "text/uri-list"])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let paths: Vec<String> = stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| l.starts_with("file://"))
                .map(|l| decode_file_uri(&l))
                .filter(|p| std::path::Path::new(p).exists())
                .collect();
            if !paths.is_empty() {
                return paths;
            }
        }
    }

    // 3) arboard: file_list() — возвращает пути файлов, скопированных
    //    из файлового менеджера (работает и на Wayland, и на X11).
    //    На Hyprland пути могут содержать trailing \r — обрезаем.
    if let Ok(mut cb) = arboard::Clipboard::new() {
        let files = cb.get().file_list().ok();
        if let Some(files) = files {
            if !files.is_empty() {
                return files.into_iter().map(|p| {
                    let s = p.to_string_lossy().to_string();
                    s.trim_end_matches(|c| c == '\r' || c == '\n').to_string()
                }).collect();
            }
        }
        // file_list() не сработал — пробуем get_text()
        if let Ok(text) = cb.get_text() {
            let t = text.trim().to_string();
            if !t.is_empty() {
                if t.starts_with("file://") {
                    return vec![decode_file_uri(&t)];
                }
                // Возвращаем любой текст, даже если это просто имя файла.
                // Фронтенд попробует прочитать его, и если не получится —
                // проигнорирует.
                return vec![t];
            }
        }
    }

    Vec::new()
}

/// Отладка: возвращает детальную информацию о содержимом буфера обмена.
#[command]
pub async fn clipboard_debug() -> serde_json::Value {
    let mut info = serde_json::json!({});

    // 1) wl-paste -t text/uri-list
    if let Ok(output) = std::process::Command::new("wl-paste")
        .args(["-t", "text/uri-list"])
        .output()
    {
        let s = String::from_utf8_lossy(&output.stdout).to_string();
        info["wl_paste_uri_list"] = serde_json::json!({
            "ok": output.status.success(),
            "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
            "stdout": s,
        });
    } else {
        info["wl_paste_uri_list"] = serde_json::json!({"error": "command not found"});
    }

    // 2) wl-paste -t text/plain
    if let Ok(output) = std::process::Command::new("wl-paste")
        .args(["-t", "text/plain"])
        .output()
    {
        let s = String::from_utf8_lossy(&output.stdout).to_string();
        info["wl_paste_plain"] = serde_json::json!({
            "ok": output.status.success(),
            "stdout": s,
        });
    } else {
        info["wl_paste_plain"] = serde_json::json!({"error": "command not found"});
    }

    // 3) wl-paste without type
    if let Ok(output) = std::process::Command::new("wl-paste").output() {
        let s = String::from_utf8_lossy(&output.stdout).to_string();
        info["wl_paste_default"] = serde_json::json!({
            "ok": output.status.success(),
            "stdout": s,
        });
    } else {
        info["wl_paste_default"] = serde_json::json!({"error": "command not found"});
    }

    // 4) arboard
    if let Ok(mut cb) = arboard::Clipboard::new() {
        let text = cb.get_text().ok();
        let files = cb.get().file_list().ok();
        info["arboard"] = serde_json::json!({
            "text": text,
            "files": files.map(|f| f.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>()),
        });
    } else {
        info["arboard"] = serde_json::json!({"error": "clipboard init failed"});
    }

    info
}

/// Декодирует file:// URI в абсолютный путь.
/// file:///home/user/my%20file.png → /home/user/my file.png
fn decode_file_uri(uri: &str) -> String {
    let path = uri.strip_prefix("file://").unwrap_or(uri);
    let mut out = String::with_capacity(path.len());
    let mut chars = path.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                out.push(byte as char);
            } else {
                out.push('%');
                out.push_str(&hex);
            }
        } else {
            out.push(c);
        }
    }
    out
}
