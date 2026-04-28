//! Чтение/правка ~/.pi/agent/mcp-config.json (включая поле disabled).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi/agent/mcp-config.json"))
}

#[derive(Serialize, Clone)]
pub struct McpServer {
    pub name: String,
    pub kind: String, // "local" | "remote" | "unknown"
    pub disabled: bool,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub env_keys: Vec<String>,
    pub headers_keys: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct McpConfig {
    pub path: String,
    pub exists: bool,
    pub servers: Vec<McpServer>,
}

#[tauri::command]
pub fn read_mcp_config() -> McpConfig {
    let p = match config_path() {
        Some(p) => p,
        None => {
            return McpConfig {
                path: String::new(),
                exists: false,
                servers: vec![],
            }
        }
    };
    let exists = p.is_file();
    let mut servers = Vec::new();
    if exists {
        if let Ok(text) = std::fs::read_to_string(&p) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(obj) = value.get("mcpServers").and_then(|v| v.as_object()) {
                    for (name, srv) in obj {
                        let so = srv.as_object().cloned().unwrap_or_default();
                        let kind = so
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        let disabled = so
                            .get("disabled")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let command = so
                            .get("command")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let args = so
                            .get("args")
                            .and_then(|v| v.as_array())
                            .map(|a| {
                                a.iter()
                                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();
                        let url = so
                            .get("url")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let env_keys = so
                            .get("env")
                            .and_then(|v| v.as_object())
                            .map(|m| m.keys().cloned().collect())
                            .unwrap_or_default();
                        let headers_keys = so
                            .get("headers")
                            .and_then(|v| v.as_object())
                            .map(|m| m.keys().cloned().collect())
                            .unwrap_or_default();
                        servers.push(McpServer {
                            name: name.clone(),
                            kind,
                            disabled,
                            command,
                            args,
                            url,
                            env_keys,
                            headers_keys,
                        });
                    }
                }
            }
        }
    }
    servers.sort_by(|a, b| a.name.cmp(&b.name));
    McpConfig {
        path: p.to_string_lossy().into_owned(),
        exists,
        servers,
    }
}

#[derive(Deserialize)]
pub struct McpToggleArgs {
    pub name: String,
    pub disabled: bool,
}

#[tauri::command]
pub fn toggle_mcp_server(args: McpToggleArgs) -> Result<(), String> {
    let p = config_path().ok_or("no home")?;
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    let mut value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let servers = value
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("mcpServers not found")?;
    let srv = servers
        .get_mut(&args.name)
        .ok_or_else(|| format!("server '{}' not found", args.name))?;
    let obj = srv.as_object_mut().ok_or("server is not object")?;
    if args.disabled {
        obj.insert("disabled".into(), serde_json::Value::Bool(true));
    } else {
        obj.remove("disabled");
    }
    let pretty = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    // атомарно через временный файл
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}
