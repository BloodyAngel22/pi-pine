//! Чтение тем pi из ~/.pi/agent/themes/*.json и встроенных.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Clone)]
pub struct ThemeInfo {
    pub name: String,
    pub path: Option<String>,
    pub source: String, // "user" | "builtin"
}

#[derive(Deserialize, Serialize, Clone)]
pub struct ThemeFile {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub vars: Option<serde_json::Value>,
    #[serde(default)]
    pub colors: Option<serde_json::Value>,
}

fn user_themes_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi/agent/themes"))
}

#[tauri::command]
pub fn list_themes_full() -> Vec<ThemeInfo> {
    let mut out = vec![
        ThemeInfo {
            name: "pi-pine-light".to_string(),
            path: None,
            source: "builtin".into(),
        },
        ThemeInfo {
            name: "pi-pine-dark".to_string(),
            path: None,
            source: "builtin".into(),
        },
        ThemeInfo {
            name: "pi-pine-windsurf".to_string(),
            path: None,
            source: "builtin".into(),
        },
    ];
    if let Some(dir) = user_themes_dir() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                let name = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                out.push(ThemeInfo {
                    name,
                    path: Some(p.to_string_lossy().into_owned()),
                    source: "user".into(),
                });
            }
        }
    }
    out
}

#[tauri::command]
pub fn read_theme(name: String) -> Result<ThemeFile, String> {
    if name == "pi-pine-light" {
        return Ok(builtin_light());
    }
    if name == "pi-pine-dark" {
        return Ok(builtin_dark());
    }
    if name == "pi-pine-windsurf" {
        return Ok(builtin_windsurf());
    }
    let dir = user_themes_dir().ok_or("no home")?;
    let path = dir.join(format!("{}.json", name));
    let txt = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&txt).map_err(|e| e.to_string())
}

fn builtin_light() -> ThemeFile {
    let raw = serde_json::json!({
        "name": "pi-pine-light",
        "vars": {
            "bg": "#F7F6F2",
            "bgSoft": "#FEFDF9",
            "bgMute": "#EFEEE8",
            "surfaceRaised": "#FFFFFF",
            "border": "#DDDAD0",
            "borderMuted": "#ECE9DF",
            "fg": "#24231F",
            "fgMute": "#68645B",
            "fgDim": "#9A9588",
            "accent": "#5B57E0",
            "accentSoft": "#ECEBFF",
            "danger": "#C94D55",
            "warn": "#B26A1B",
            "success": "#3D8B5A",
            "syntaxComment": "#8B8679",
            "syntaxKeyword": "#5B57E0",
            "syntaxString": "#3D7B4F",
            "syntaxNumber": "#9B5B18",
            "syntaxType": "#2F6F9F",
            "syntaxFunction": "#4767C7",
            "syntaxVariable": "#A34C68"
        },
        "colors": {
            "base": "bg",
            "mantle": "bgSoft",
            "crust": "bgMute",
            "surface0": "surfaceRaised",
            "surface1": "bgMute",
            "surface2": "border",
            "text": "fg",
            "subtext0": "fgMute",
            "dim": "fgDim",
            "border": "border",
            "borderMuted": "borderMuted",
            "accent": "accent",
            "selectedBg": "accentSoft",
            "userMessageBg": "surfaceRaised",
            "userMessageText": "fg",
            "thinkingText": "fgMute",
            "success": "success",
            "warning": "warn",
            "error": "danger",
            "syntaxComment": "syntaxComment",
            "syntaxKeyword": "syntaxKeyword",
            "syntaxString": "syntaxString",
            "syntaxNumber": "syntaxNumber",
            "syntaxType": "syntaxType",
            "syntaxFunction": "syntaxFunction",
            "syntaxVariable": "syntaxVariable"
        }
    });
    serde_json::from_value(raw).unwrap()
}

fn builtin_windsurf() -> ThemeFile {
    let raw = serde_json::json!({
        "name": "pi-pine-windsurf",
        "vars": {
            "bg": "#0E0F1A",
            "bgSoft": "#13162A",
            "bgMute": "#1A1E36",
            "border": "#262C49",
            "borderMuted": "#1F2440",
            "fg": "#E6E8F2",
            "fgMute": "#9BA3C7",
            "fgDim": "#5C6394",
            "accent": "#48D7C9",
            "accentSoft": "#1F4A53",
            "danger": "#F5677F",
            "warn": "#F0B66B",
            "success": "#7BD88F"
        },
        "colors": {
            "base": "bg",
            "mantle": "bgSoft",
            "crust": "bgMute",
            "text": "fg",
            "subtext0": "fgMute",
            "dim": "fgDim",
            "border": "border",
            "borderMuted": "borderMuted",
            "accent": "accent",
            "selectedBg": "accentSoft",
            "userMessageBg": "bgSoft",
            "userMessageText": "fg",
            "thinkingText": "fgMute",
            "success": "success",
            "warning": "warn",
            "error": "danger"
        }
    });
    serde_json::from_value(raw).unwrap()
}

fn builtin_dark() -> ThemeFile {
    let raw = serde_json::json!({
        "name": "pi-pine-dark",
        "vars": {
            "bg": "#0a0a0a",
            "bgSoft": "#131313",
            "bgMute": "#1a1a1a",
            "border": "#262626",
            "fg": "#ededed",
            "fgMute": "#a3a3a3",
            "fgDim": "#6b6b6b",
            "accent": "#7aa2f7",
            "accentSoft": "#2c3a5a",
            "danger": "#f7768e",
            "warn": "#e0af68",
            "success": "#9ece6a"
        },
        "colors": {
            "base": "bg",
            "mantle": "bgSoft",
            "crust": "bgMute",
            "text": "fg",
            "subtext0": "fgMute",
            "dim": "fgDim",
            "border": "border",
            "borderMuted": "border",
            "accent": "accent",
            "selectedBg": "accentSoft",
            "userMessageBg": "bgSoft",
            "userMessageText": "fg",
            "thinkingText": "fgMute",
            "success": "success",
            "warning": "warn",
            "error": "danger"
        }
    });
    serde_json::from_value(raw).unwrap()
}
