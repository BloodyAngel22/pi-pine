//! Команды для конфигурации bundled extension analyze-image.
//! Читает/пишет ~/.pi/agent/extensions/analyze-image/config.json
//! Проверяет статус зависимостей (tesseract.js, transformers, model cache).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct AnalyzeImageConfig {
    #[serde(default = "default_ocr_enabled")]
    pub ocr_enabled: bool,
    #[serde(default = "default_ocr_lang")]
    pub ocr_lang: String,
    #[serde(default = "default_captioning_enabled")]
    pub captioning_enabled: bool,
    #[serde(default = "default_captioning_backend")]
    pub captioning_backend: String,
    #[serde(default = "default_rule_based_classification")]
    pub rule_based_classification: bool,
    #[serde(default = "default_max_image_size_mb")]
    pub max_image_size_mb: u32,
    #[serde(default = "default_ollama_host")]
    pub ollama_host: String,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
}

fn default_ocr_enabled() -> bool { true }
fn default_ocr_lang() -> String { "eng+rus".to_string() }
fn default_captioning_enabled() -> bool { false }
fn default_captioning_backend() -> String { "tiny".to_string() }
fn default_rule_based_classification() -> bool { true }
fn default_max_image_size_mb() -> u32 { 10 }
fn default_ollama_host() -> String { "http://localhost:11434".to_string() }
fn default_ollama_model() -> String { "llava".to_string() }

impl Default for AnalyzeImageConfig {
    fn default() -> Self {
        Self {
            ocr_enabled: default_ocr_enabled(),
            ocr_lang: default_ocr_lang(),
            captioning_enabled: default_captioning_enabled(),
            captioning_backend: default_captioning_backend(),
            rule_based_classification: default_rule_based_classification(),
            max_image_size_mb: default_max_image_size_mb(),
            ollama_host: default_ollama_host(),
            ollama_model: default_ollama_model(),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct AnalyzeImageStatus {
    pub tesseract_installed: bool,
    pub transformers_installed: bool,
    pub cache_size_bytes: u64,
    pub cache_path: String,
    pub ocr_languages_available: String,
    pub ollama_available: bool,
}

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| {
        h.join(".pi/agent/extensions/analyze-image/config.json")
    })
}

/// Ищет transformers.js cache, который живёт внутри node_modules/@huggingface/transformers/.cache/
fn huggingface_cache_dir(pi_binary_path: &Option<String>) -> PathBuf {
    // transformers.js v3 caches inside the npm package: node_modules/@huggingface/transformers/.cache/
    // Try to find it near the pi binary
    if let Some(ref pi_path) = pi_binary_path {
        let resolved = resolve_path(pi_path);
        if let Some(parent) = resolved.parent() {
            let mut dir = parent.to_path_buf();
            for _ in 0..6 {
                let candidate = dir.join("node_modules/@huggingface/transformers/.cache");
                if candidate.exists() {
                    return candidate;
                }
                if let Some(p) = dir.parent() { dir = p.to_path_buf(); } else { break; }
            }
        }
    }

    // Try from current exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let mut d = dir.to_path_buf();
            for _ in 0..5 {
                let candidate = d.join("node_modules/@huggingface/transformers/.cache");
                if candidate.exists() {
                    return candidate;
                }
                if let Some(p) = d.parent() { d = p.to_path_buf(); } else { break; }
            }
        }
    }

    // Fallback: HF_HOME or ~/.cache/huggingface/
    if let Ok(val) = std::env::var("HF_HOME") {
        return PathBuf::from(val).join("hub");
    }
    dirs::home_dir()
        .map(|h| h.join(".cache/huggingface/hub"))
        .unwrap_or_else(|| PathBuf::from("/tmp/.cache/huggingface/hub"))
}

/// Ресолвит symlink, возвращает реальный путь к файлу.
fn resolve_path(path: &str) -> PathBuf {
    let p = PathBuf::from(path);
    if p.is_symlink() {
        if let Ok(target) = std::fs::read_link(&p) {
            let resolved = if target.is_absolute() {
                target
            } else if let Some(parent) = p.parent() {
                parent.join(target)
            } else {
                p.clone()
            };
            return resolved.canonicalize().unwrap_or(resolved);
        }
    }
    p.canonicalize().unwrap_or(p)
}

/// Ищет npm-пакет на диске, обходя все возможные расположения node_modules.
fn find_npm_package(name: &str, pi_binary_path: &Option<String>) -> bool {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. От pi binary — ресолвим symlink и идём вверх
    if let Some(ref pi_path) = pi_binary_path {
        let resolved = resolve_path(pi_path);
        if let Some(parent) = resolved.parent() {
            let mut dir = parent.to_path_buf();
            for _ in 0..6 {
                candidates.push(dir.join("node_modules").join(name).join("package.json"));
                if let Some(p) = dir.parent() { dir = p.to_path_buf(); } else { break; }
            }
        }
    }

    // 2. От Tauri exe
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let mut d = dir.to_path_buf();
            for _ in 0..5 {
                candidates.push(d.join("node_modules").join(name).join("package.json"));
                if let Some(p) = d.parent() { d = p.to_path_buf(); } else { break; }
            }
        }
    }

    // 3. От CWD
    if let Ok(cwd) = std::env::current_dir() {
        let mut d = cwd;
        for _ in 0..5 {
            candidates.push(d.join("node_modules").join(name).join("package.json"));
            if let Some(p) = d.parent() { d = p.to_path_buf(); } else { break; }
        }
    }

    // 4. NODE_PATH env var
    if let Ok(node_path) = std::env::var("NODE_PATH") {
        for p in std::env::split_paths(&node_path) {
            candidates.push(p.join(name).join("package.json"));
        }
    }

    // 5. Глобальные npm root
    let global_roots = ["/usr/local/lib/node_modules", "/usr/lib/node_modules"];
    for root in &global_roots {
        candidates.push(PathBuf::from(root).join(name).join("package.json"));
    }

    // 6. ~/node_modules и типичные директории проектов
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join("node_modules").join(name).join("package.json"));
        for sub in &["dev", "projects", "code", "programming", "work", "src"] {
            let base = home.join(sub);
            if let Ok(entries) = std::fs::read_dir(&base) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_dir() {
                        candidates.push(p.join("node_modules").join(name).join("package.json"));
                    }
                }
            }
        }
    }

    // 7. ~/.pi/agent/ — рядом с конфигом пилота
    if let Some(home) = dirs::home_dir() {
        let mut d = home.join(".pi");
        for _ in 0..3 {
            candidates.push(d.join("node_modules").join(name).join("package.json"));
            if let Some(p) = d.parent() { d = p.to_path_buf(); } else { break; }
        }
    }

    candidates.iter().any(|p| p.exists())
}

fn check_ollama_running() -> bool {
    let output = std::process::Command::new("curl")
        .args(["-s", "-o", "/dev/null", "-w", "%{http_code}", "--connect-timeout", "2", "http://localhost:11434/api/tags"])
        .output();
    match output {
        Ok(out) => {
            let code = String::from_utf8_lossy(&out.stdout).trim().to_string();
            code == "200"
        }
        Err(_) => false,
    }
}

fn dir_size(path: &PathBuf) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let meta = entry.metadata().ok();
            if let Some(m) = meta {
                if m.is_file() {
                    total += m.len();
                } else if m.is_dir() {
                    total += dir_size(&entry.path());
                }
            }
        }
    }
    total
}

fn available_ocr_langs() -> String {
    let tessdata_dir = dirs::home_dir()
        .map(|h| h.join(".cache/tesseract.js/4.0.0"))
        .unwrap_or_else(|| PathBuf::from("/tmp"));
    let mut langs: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&tessdata_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".traineddata") {
                let lang = name.trim_end_matches(".traineddata").to_string();
                langs.push(lang);
            }
        }
    }
    langs.sort();
    if langs.is_empty() {
        return "eng (download on first use)".to_string();
    }
    langs.join(", ")
}

#[tauri::command]
pub fn get_analyze_image_config() -> AnalyzeImageConfig {
    let Some(p) = config_path() else {
        return AnalyzeImageConfig::default();
    };
    let Ok(text) = std::fs::read_to_string(&p) else {
        return AnalyzeImageConfig::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

#[tauri::command]
pub fn set_analyze_image_config(config: AnalyzeImageConfig) -> Result<(), String> {
    let p = config_path().ok_or("no home")?;
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let pretty = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_analyze_image_status(pi_binary_path: Option<String>) -> AnalyzeImageStatus {
    let cache_dir = huggingface_cache_dir(&pi_binary_path);
    let cache_size = if cache_dir.exists() {
        dir_size(&cache_dir)
    } else {
        0
    };

    AnalyzeImageStatus {
        tesseract_installed: find_npm_package("tesseract.js", &pi_binary_path),
        transformers_installed: find_npm_package("@huggingface/transformers", &pi_binary_path),
        cache_size_bytes: cache_size,
        cache_path: cache_dir.to_string_lossy().to_string(),
        ocr_languages_available: available_ocr_langs(),
        ollama_available: check_ollama_running(),
    }
}
