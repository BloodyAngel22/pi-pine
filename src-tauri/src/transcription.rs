//! Команды голосовой транскрибации (STT) через любой сервер с OpenAI-совместимым
//! `/v1/audio/transcriptions` API (адрес и модель настраиваются в Settings → Голос).
//! Конфиг хранится в ~/.pi-pine/transcription.json — отдельно от ~/.pi/agent/,
//! которым управляет pi-mono-x.
//!
//! API-ключ никогда не покидает Rust-процесс: фронтенд вызывает только команды
//! ниже и получает обратно текст/статусы, но не сам ключ.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct TranscriptionConfig {
    #[serde(default = "default_base_url")]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
}

fn default_base_url() -> String {
    "http://localhost:20128".to_string()
}

impl Default for TranscriptionConfig {
    fn default() -> Self {
        Self {
            base_url: default_base_url(),
            api_key: String::new(),
            model: String::new(),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct TestConnectionResult {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct AudioModelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct TranscriptionResult {
    pub text: String,
    pub no_speech_detected: bool,
}

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".pi-pine/transcription.json"))
}

/// Подставляет значения из PI_PINE_STT_API_KEY / PI_PINE_STT_BASE_URL, если
/// поля не заданы в конфиге pi-pine — удобно для запуска из терминала, где эти
/// переменные уже экспортированы. Явно сохранённые в Settings значения
/// в приоритете и никогда не перезаписываются переменными окружения.
fn apply_env_fallback(mut config: TranscriptionConfig) -> TranscriptionConfig {
    if config.api_key.is_empty() {
        if let Ok(v) = std::env::var("PI_PINE_STT_API_KEY") {
            config.api_key = v;
        }
    }
    if config.base_url.is_empty() || config.base_url == default_base_url() {
        if let Ok(v) = std::env::var("PI_PINE_STT_BASE_URL") {
            config.base_url = v;
        }
    }
    config
}

#[tauri::command]
pub fn get_transcription_config() -> TranscriptionConfig {
    let Some(p) = config_path() else {
        return apply_env_fallback(TranscriptionConfig::default());
    };
    let Ok(text) = std::fs::read_to_string(&p) else {
        return apply_env_fallback(TranscriptionConfig::default());
    };
    let config: TranscriptionConfig = serde_json::from_str(&text).unwrap_or_default();
    apply_env_fallback(config)
}

#[tauri::command]
pub fn set_transcription_config(config: TranscriptionConfig) -> Result<(), String> {
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

// Команды ниже — реальный `async fn` с не-блокирующим `reqwest::Client`.
// Tauri по умолчанию выполняет НЕ-async команды синхронно, инлайново, прямо
// в потоке, обработавшем IPC-вызов (на Linux это главный GTK-поток) — блокирующий
// reqwest там означало полное зависание окна на время HTTP-запроса к серверу.
// `async fn` диспетчерится через async-рантайм Tauri и не блокирует GTK-поток.
fn http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

#[tauri::command]
pub async fn test_stt_connection(base_url: String) -> Result<TestConnectionResult, String> {
    let client = http_client(Duration::from_secs(3))?;
    // Служебные (management) эндпоинты некоторых бэкендов требуют отдельный
    // management-токен, недоступный pi-pine. /v1/models — публичный
    // OpenAI-совместимый листинг моделей, обычно отвечает 200 даже без
    // Authorization — используем его как liveness-проверку.
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let start = std::time::Instant::now();

    match client.get(&url).send().await {
        Ok(_) => Ok(TestConnectionResult {
            reachable: true,
            latency_ms: Some(start.elapsed().as_millis() as u64),
            error: None,
        }),
        Err(e) => Ok(TestConnectionResult {
            reachable: false,
            latency_ms: None,
            error: Some(describe_reqwest_error(&e)),
        }),
    }
}

#[tauri::command]
pub async fn list_transcription_models(
    base_url: String,
    api_key: String,
) -> Result<Vec<AudioModelInfo>, String> {
    let client = http_client(Duration::from_secs(10))?;
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));

    let res = client
        .get(&url)
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| describe_reqwest_error(&e))?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(describe_upstream_error(status.as_u16(), &body));
    }

    #[derive(Deserialize)]
    struct ModelEntry {
        id: String,
        #[serde(default)]
        r#type: Option<String>,
        #[serde(default)]
        subtype: Option<String>,
    }
    #[derive(Deserialize)]
    struct ModelsResponse {
        data: Vec<ModelEntry>,
    }

    let parsed: ModelsResponse = res
        .json()
        .await
        .map_err(|e| format!("Не удалось разобрать ответ сервера: {}", e))?;

    let models = parsed
        .data
        .into_iter()
        .filter(|m| m.r#type.as_deref() == Some("audio") && m.subtype.as_deref() == Some("transcription"))
        .map(|m| {
            let name = m.id.split('/').next_back().unwrap_or(&m.id).to_string();
            AudioModelInfo { id: m.id, name }
        })
        .collect();

    Ok(models)
}

#[tauri::command]
pub async fn transcribe_audio(audio_base64: String, mime_type: String) -> Result<TranscriptionResult, String> {
    let config = get_transcription_config();
    if config.api_key.is_empty() {
        return Err("API-ключ не настроен (Настройки → Голос)".to_string());
    }
    if config.model.is_empty() {
        return Err("Модель транскрипции не выбрана (Настройки → Голос)".to_string());
    }

    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_base64)
        .map_err(|e| format!("Не удалось декодировать аудио: {}", e))?;

    let client = http_client(Duration::from_secs(30))?;
    let url = format!(
        "{}/v1/audio/transcriptions",
        config.base_url.trim_end_matches('/')
    );

    let file_part = reqwest::multipart::Part::bytes(audio_bytes)
        .file_name("audio.webm")
        .mime_str(&mime_type)
        .map_err(|e| format!("Некорректный MIME-тип аудио: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .text("model", config.model.clone())
        .part("file", file_part);

    let res = client
        .post(&url)
        .bearer_auth(&config.api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| describe_reqwest_error(&e))?;

    let status = res.status();
    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(describe_upstream_error(status.as_u16(), &body));
    }

    #[derive(Deserialize)]
    struct TranscriptionResponse {
        text: Option<String>,
        #[serde(default)]
        no_speech_detected: Option<bool>,
        #[serde(rename = "noSpeechDetected", default)]
        no_speech_detected_camel: Option<bool>,
    }

    let parsed: TranscriptionResponse = res
        .json()
        .await
        .map_err(|e| format!("Не удалось разобрать ответ сервера: {}", e))?;

    let text = parsed.text.unwrap_or_default();
    let no_speech_detected = parsed
        .no_speech_detected
        .or(parsed.no_speech_detected_camel)
        .unwrap_or(text.is_empty());

    Ok(TranscriptionResult {
        text,
        no_speech_detected,
    })
}

fn describe_reqwest_error(e: &reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Сервер транскрипции недоступен — проверьте адрес и что сервер запущен".to_string()
    } else {
        format!("Ошибка запроса к серверу транскрипции: {}", e)
    }
}

fn describe_upstream_error(status: u16, body: &str) -> String {
    #[derive(Deserialize)]
    struct ErrorEnvelope {
        error: ErrorDetail,
    }
    #[derive(Deserialize)]
    struct ErrorDetail {
        message: String,
    }

    let message = serde_json::from_str::<ErrorEnvelope>(body)
        .map(|e| e.error.message)
        .unwrap_or_else(|_| body.to_string());

    match status {
        401 => "Неверный API-ключ".to_string(),
        400 if message.contains("No credentials") => {
            "На сервере не настроен провайдер транскрипции — проверьте конфигурацию бэкенда".to_string()
        }
        _ => format!("Ошибка сервера транскрипции ({}): {}", status, message),
    }
}
