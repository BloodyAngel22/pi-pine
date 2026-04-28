//! Чтение/запись ~/.pi/agent/favorites.json.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FavoriteModel {
    pub provider: String,
    pub id: String,
}

fn favorites_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi/agent/favorites.json"))
}

#[tauri::command]
pub fn read_favorites() -> Vec<FavoriteModel> {
    let Some(p) = favorites_path() else {
        return vec![];
    };
    let Ok(text) = std::fs::read_to_string(&p) else {
        return vec![];
    };
    serde_json::from_str(&text).unwrap_or_default()
}

#[tauri::command]
pub fn write_favorites(items: Vec<FavoriteModel>) -> Result<(), String> {
    let p = favorites_path().ok_or("no home")?;
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let pretty = serde_json::to_string_pretty(&items).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_pi_settings() -> serde_json::Value {
    let Some(home) = dirs::home_dir() else {
        return serde_json::Value::Null;
    };
    let p = home.join(".pi/agent/settings.json");
    let Ok(text) = std::fs::read_to_string(&p) else {
        return serde_json::Value::Null;
    };
    serde_json::from_str(&text).unwrap_or(serde_json::Value::Null)
}

/// Записывает только указанные ключи в settings.json (мерджит с существующим).
#[tauri::command]
pub fn write_pi_settings_partial(patch: serde_json::Value) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("no home")?;
    let p = home.join(".pi/agent/settings.json");
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let mut current: serde_json::Value = std::fs::read_to_string(&p)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let cur_obj = current.as_object_mut().ok_or("settings not an object")?;
    let patch_obj = patch.as_object().ok_or("patch not an object")?;
    for (k, v) in patch_obj {
        cur_obj.insert(k.clone(), v.clone());
    }
    let pretty = serde_json::to_string_pretty(&current).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, pretty).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
    Ok(())
}
