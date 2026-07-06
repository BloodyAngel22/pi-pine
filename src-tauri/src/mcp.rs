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

/// Атомарная запись JSON-конфига через временный файл + rename.
fn atomic_write_json(p: &PathBuf, value: &serde_json::Value) -> Result<(), String> {
    let pretty = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, p).map_err(|e| e.to_string())?;
    Ok(())
}

/// Читает существующий mcp-config.json (или создаёт пустой каркас, если файла нет).
fn read_config_value(p: &PathBuf) -> Result<serde_json::Value, String> {
    if !p.is_file() {
        return Ok(serde_json::json!({ "mcpServers": {} }));
    }
    let text = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
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
    atomic_write_json(&p, &value)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerWriteArgs {
    pub name: String,
    /// Исходное имя сервера при переименовании (None при создании нового).
    pub original_name: Option<String>,
    pub kind: String, // "local" | "remote"
    pub command: Option<String>,
    pub args: Vec<String>,
    pub url: Option<String>,
    pub disabled: bool,
    /// Ключи для добавления/замены — значения секретов никогда не приходят
    /// с фронтенда для уже существующих ключей (read_mcp_config отдаёт
    /// только имена ключей), поэтому запись всегда мерджит, а не заменяет
    /// env/headers целиком.
    #[serde(default)]
    pub env_set: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub env_remove: Vec<String>,
    #[serde(default)]
    pub headers_set: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub headers_remove: Vec<String>,
}

fn merge_string_map(
    entry: &mut serde_json::Map<String, serde_json::Value>,
    field: &str,
    set: &std::collections::HashMap<String, String>,
    remove: &[String],
) {
    if set.is_empty() && remove.is_empty() {
        return;
    }
    let mut map = entry
        .get(field)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    for key in remove {
        map.remove(key);
    }
    for (k, v) in set {
        map.insert(k.clone(), serde_json::Value::String(v.clone()));
    }
    if map.is_empty() {
        entry.remove(field);
    } else {
        entry.insert(field.into(), serde_json::Value::Object(map));
    }
}

#[tauri::command]
pub fn write_mcp_server(args: McpServerWriteArgs) -> Result<(), String> {
    let name = args.name.trim();
    if name.is_empty() {
        return Err("Имя сервера не может быть пустым".into());
    }
    if args.kind != "local" && args.kind != "remote" {
        return Err(format!("Неизвестный тип сервера: {}", args.kind));
    }
    if args.kind == "local" && args.command.as_deref().unwrap_or("").trim().is_empty() {
        return Err("Укажи command для локального сервера".into());
    }
    if args.kind == "remote" && args.url.as_deref().unwrap_or("").trim().is_empty() {
        return Err("Укажи url для удалённого сервера".into());
    }

    let p = config_path().ok_or("no home")?;
    let mut value = read_config_value(&p)?;
    let root = value
        .as_object_mut()
        .ok_or("конфиг повреждён: корень не объект")?;
    let servers = root
        .entry("mcpServers".to_string())
        .or_insert_with(|| serde_json::Value::Object(Default::default()))
        .as_object_mut()
        .ok_or("mcpServers не объект")?;

    let original_name = args.original_name.as_deref().unwrap_or(name);
    let renaming = original_name != name;
    let is_new = args.original_name.is_none();
    if servers.contains_key(name) && (renaming || is_new) {
        return Err(format!("Сервер '{}' уже существует", name));
    }

    let mut entry = servers
        .get(original_name)
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    entry.insert(
        "type".into(),
        serde_json::Value::String(args.kind.clone()),
    );
    if args.kind == "local" {
        entry.insert(
            "command".into(),
            serde_json::Value::String(args.command.clone().unwrap_or_default()),
        );
        entry.insert(
            "args".into(),
            serde_json::Value::Array(
                args.args
                    .iter()
                    .map(|a| serde_json::Value::String(a.clone()))
                    .collect(),
            ),
        );
        entry.remove("url");
        entry.remove("headers");
    } else {
        entry.insert(
            "url".into(),
            serde_json::Value::String(args.url.clone().unwrap_or_default()),
        );
        entry.remove("command");
        entry.remove("args");
        entry.remove("env");
    }

    if args.kind == "local" {
        merge_string_map(&mut entry, "env", &args.env_set, &args.env_remove);
    } else {
        merge_string_map(&mut entry, "headers", &args.headers_set, &args.headers_remove);
    }

    if args.disabled {
        entry.insert("disabled".into(), serde_json::Value::Bool(true));
    } else {
        entry.remove("disabled");
    }

    if renaming {
        servers.remove(original_name);
    }
    servers.insert(name.to_string(), serde_json::Value::Object(entry));

    atomic_write_json(&p, &value)
}

#[derive(Deserialize)]
pub struct McpServerDeleteArgs {
    pub name: String,
}

#[tauri::command]
pub fn delete_mcp_server(args: McpServerDeleteArgs) -> Result<(), String> {
    let p = config_path().ok_or("no home")?;
    let mut value = read_config_value(&p)?;
    let servers = value
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("mcpServers не найден")?;
    if servers.remove(&args.name).is_none() {
        return Err(format!("Сервер '{}' не найден", args.name));
    }
    atomic_write_json(&p, &value)
}
