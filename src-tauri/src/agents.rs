//! CRUD для ~/.pi/agent/agents/*.json и применение agent preset через pi RPC.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

use crate::rpc::{rpc_send, RpcManager};

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentPresetModel {
    pub provider: Option<String>,
    pub model_id: Option<String>,
    pub id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentPresetPermissions {
    pub bash: Option<String>,
    pub files: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentPresetMcpPermissions {
    pub mode: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentPreset {
    pub name: String,
    pub description: Option<String>,
    pub model: Option<AgentPresetModel>,
    pub thinking_level: Option<String>,
    pub system_prompt: Option<String>,
    pub permissions: Option<AgentPresetPermissions>,
    pub mcp_permissions: Option<AgentPresetMcpPermissions>,
    pub auto_retry: Option<bool>,
    pub auto_compaction: Option<bool>,
    pub steering_mode: Option<String>,
    pub follow_up_mode: Option<String>,
    pub project_cwd: Option<String>,
}

impl Default for AgentPreset {
    fn default() -> Self {
        Self {
            name: "default".to_string(),
            description: Some("Базовый пресет агента".to_string()),
            model: None,
            thinking_level: Some("medium".to_string()),
            system_prompt: Some(String::new()),
            permissions: Some(AgentPresetPermissions {
                bash: Some("ask".to_string()),
                files: Some("ask".to_string()),
            }),
            mcp_permissions: Some(AgentPresetMcpPermissions {
                mode: Some("ask".to_string()),
            }),
            auto_retry: Some(true),
            auto_compaction: Some(true),
            steering_mode: Some("all".to_string()),
            follow_up_mode: Some("all".to_string()),
            project_cwd: None,
        }
    }
}

fn presets_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".pi/agent/agents"))
        .ok_or_else(|| "no home".to_string())
}

fn sanitize_preset_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim().trim_end_matches(".json");
    if trimmed.is_empty() {
        return Err("preset name is empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err("invalid preset name".to_string());
    }
    Ok(trimmed.to_string())
}

fn preset_path(name: &str) -> Result<PathBuf, String> {
    let safe = sanitize_preset_name(name)?;
    Ok(presets_dir()?.join(format!("{safe}.json")))
}

fn normalize_cwd(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.to_string())
}

#[tauri::command]
pub fn list_agent_presets() -> Result<Vec<AgentPreset>, String> {
    let dir = presets_dir()?;
    let mut presets = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(presets);
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        if let Ok(preset) = serde_json::from_str::<AgentPreset>(&text) {
            presets.push(preset);
        }
    }
    presets.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(presets)
}

#[tauri::command]
pub fn read_agent_preset(name: String) -> Result<AgentPreset, String> {
    let p = preset_path(&name)?;
    let text = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_agent_preset(preset: AgentPreset) -> Result<(), String> {
    let safe = sanitize_preset_name(&preset.name)?;
    let dir = presets_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(format!("{safe}.json"));
    let pretty = serde_json::to_string_pretty(&preset).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_agent_preset(name: String) -> Result<(), String> {
    let p = preset_path(&name)?;
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn rpc_load_agent_preset(
    name: String,
    state: tauri::State<'_, Arc<RpcManager>>,
) -> Result<(), String> {
    let safe = sanitize_preset_name(&name)?;
    let line = serde_json::json!({ "type": "load_agent_preset", "presetName": safe }).to_string();
    rpc_send(line, state)
}

#[tauri::command]
pub fn get_preset_for_cwd(cwd: String) -> Result<Option<String>, String> {
    let target = normalize_cwd(&cwd);
    let presets = list_agent_presets()?;
    Ok(presets.into_iter().find_map(|preset| {
        let project_cwd = preset.project_cwd.as_deref()?.trim();
        if project_cwd.is_empty() {
            return None;
        }
        if normalize_cwd(project_cwd) == target {
            Some(preset.name)
        } else {
            None
        }
    }))
}

fn default_preset_from_settings() -> AgentPreset {
    let mut preset = AgentPreset::default();
    if let Some(home) = dirs::home_dir() {
        let settings_path = home.join(".pi/agent/settings.json");
        if let Ok(text) = std::fs::read_to_string(settings_path) {
            if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&text) {
                let provider = settings
                    .get("defaultProvider")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                let model_id = settings
                    .get("defaultModel")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                if provider.is_some() || model_id.is_some() {
                    preset.model = Some(AgentPresetModel {
                        provider,
                        model_id,
                        id: None,
                    });
                }
                if let Some(level) = settings.get("defaultThinkingLevel").and_then(|v| v.as_str()) {
                    preset.thinking_level = Some(level.to_string());
                }
                if let Some(mode) = settings.get("steeringMode").and_then(|v| v.as_str()) {
                    preset.steering_mode = Some(mode.to_string());
                }
                if let Some(mode) = settings.get("followUpMode").and_then(|v| v.as_str()) {
                    preset.follow_up_mode = Some(mode.to_string());
                }
                if let Some(enabled) = settings
                    .get("retry")
                    .and_then(|v| v.get("enabled"))
                    .and_then(|v| v.as_bool())
                {
                    preset.auto_retry = Some(enabled);
                }
                if let Some(enabled) = settings
                    .get("compaction")
                    .and_then(|v| v.get("enabled"))
                    .and_then(|v| v.as_bool())
                {
                    preset.auto_compaction = Some(enabled);
                }
            }
        }
    }
    preset
}

#[tauri::command]
pub fn ensure_default_preset() -> Result<(), String> {
    let dir = presets_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let has_json = std::fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .any(|entry| entry.path().extension().and_then(|e| e.to_str()) == Some("json"));
    if !has_json {
        write_agent_preset(default_preset_from_settings())?;
    }
    Ok(())
}
