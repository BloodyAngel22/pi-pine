//! Настройка логирования RPC-трафика (stdin/stdout `pi --mode rpc`) на диск.
//! Конфиг хранится в ~/.pi-pine/rpc_log_config.json — тот же паттерн, что
//! transcription.rs использует для ~/.pi-pine/transcription.json.
//!
//! Внимание: редакции секретов нет — если в prompt/tool-call payload'ах
//! передаются ключи, они попадут в лог as-is, как и в существующий
//! in-memory stderr-буфер.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct RpcLogConfig {
    #[serde(default)]
    pub enabled: bool,
}

impl Default for RpcLogConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi-pine/rpc_log_config.json"))
}

pub fn logs_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi-pine/logs"))
}

#[tauri::command]
pub fn get_rpc_log_config() -> RpcLogConfig {
    let Some(p) = config_path() else {
        return RpcLogConfig::default();
    };
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_rpc_log_config(config: RpcLogConfig) -> Result<(), String> {
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
