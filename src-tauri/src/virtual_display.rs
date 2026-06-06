//! Управление изолированным виртуальным дисплеем для агента.
//! Запускает Xvfb :99, openbox (WM), x11vnc (для просмотра).
//! Предоставляет Tauri commands для управления и скриншотов.

use serde::Serialize;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// Состояние виртуального дисплея
pub struct VirtualDisplayState {
    xvfb: Option<Child>,
    openbox: Option<Child>,
    x11vnc: Option<Child>,
    width: u32,
    height: u32,
    display: String,
}

impl Default for VirtualDisplayState {
    fn default() -> Self {
        Self {
            xvfb: None,
            openbox: None,
            x11vnc: None,
            width: 1920,
            height: 1080,
            display: ":99".into(),
        }
    }
}

impl VirtualDisplayState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn running(&self) -> bool {
        self.xvfb.is_some()
    }
}

/// Менеджер виртуального дисплея (Tauri managed state)
pub struct VirtualDisplayManager {
    pub inner: Mutex<VirtualDisplayState>,
}

impl VirtualDisplayManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(VirtualDisplayState::new()),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct VirtualDisplayStatus {
    pub running: bool,
    pub display: String,
    pub width: u32,
    pub height: u32,
    pub vnc_port: u16,
}

#[derive(Serialize, Clone)]
pub struct ScreenshotResult {
    pub data: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn start_virtual_display(
    width: Option<u32>,
    height: Option<u32>,
    state: tauri::State<'_, VirtualDisplayManager>,
) -> Result<VirtualDisplayStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;

    // Если уже запущен — возвращаем статус
    if guard.running() {
        return Ok(VirtualDisplayStatus {
            running: true,
            display: guard.display.clone(),
            width: guard.width,
            height: guard.height,
            vnc_port: 5900,
        });
    }

    let w = width.unwrap_or(1920).max(800).min(3840);
    let h = height.unwrap_or(1080).max(600).min(2160);
    let display = ":99".to_string();
    let screen = format!("{}x{}x24", w, h);

    // 1) Xvfb
    let xvfb = Command::new("Xvfb")
        .args([&display, "-screen", "0", &screen, "-ac", "+extension", "RANDR"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start Xvfb: {}. Is xvfb installed? (sudo pacman -S xorg-server-xvfb)", e))?;

    // Небольшая пауза, чтобы Xvfb инициализировался
    std::thread::sleep(std::time::Duration::from_millis(500));

    // 2) openbox (минимальный WM). Openbox не принимает --display на всех сборках,
    // поэтому DISPLAY передаём через окружение.
    let openbox = Command::new("openbox")
        .env("DISPLAY", &display)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start openbox: {}. Is openbox installed? (sudo pacman -S openbox)", e))?;

    // 3) x11vnc
    let x11vnc = Command::new("x11vnc")
        .args([
            "-display",
            &display,
            "-forever",
            "-nopw",
            "-rfbport",
            "5900",
            "-shared",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start x11vnc: {}. Is x11vnc installed? (sudo pacman -S x11vnc)", e))?;

    guard.xvfb = Some(xvfb);
    guard.openbox = Some(openbox);
    guard.x11vnc = Some(x11vnc);
    guard.width = w;
    guard.height = h;
    guard.display = display;

    Ok(VirtualDisplayStatus {
        running: true,
        display: guard.display.clone(),
        width: w,
        height: h,
        vnc_port: 5900,
    })
}

#[tauri::command]
pub fn stop_virtual_display(
    state: tauri::State<'_, VirtualDisplayManager>,
) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = guard.x11vnc.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Some(mut child) = guard.openbox.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Some(mut child) = guard.xvfb.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    Ok(())
}

#[tauri::command]
pub fn virtual_display_status(
    state: tauri::State<'_, VirtualDisplayManager>,
) -> Result<VirtualDisplayStatus, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;

    // Проверяем жив ли Xvfb
    let alive = guard.xvfb.as_mut().map_or(false, |child| {
        child.try_wait().map(|status| status.is_none()).unwrap_or(false)
    });

    if !alive {
        return Ok(VirtualDisplayStatus {
            running: false,
            display: guard.display.clone(),
            width: guard.width,
            height: guard.height,
            vnc_port: 5900,
        });
    }

    Ok(VirtualDisplayStatus {
        running: true,
        display: guard.display.clone(),
        width: guard.width,
        height: guard.height,
        vnc_port: 5900,
    })
}

#[tauri::command]
pub fn screenshot_virtual_display(
    state: tauri::State<'_, VirtualDisplayManager>,
) -> Result<ScreenshotResult, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;

    if !guard.running() {
        return Err("Virtual display is not running".to_string());
    }

    let display = &guard.display;
    let output_path = format!("/tmp/vs-rust-{}.png", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());

    // Запускаем import
    let output = Command::new("import")
        .args(["-display", display, "-window", "root", &output_path])
        .output()
        .map_err(|e| format!("Failed to run import: {}. Is ImageMagick installed?", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("import failed: {}", stderr));
    }

    // Читаем файл
    let bytes = std::fs::read(&output_path)
        .map_err(|e| format!("Failed to read screenshot: {}", e))?;

    let data = base64_encode(&bytes);

    // Пробуем получить размеры через identify (ImageMagick)
    let (img_w, img_h) = get_image_size(&output_path);

    // Удаляем временный файл
    let _ = std::fs::remove_file(&output_path);

    Ok(ScreenshotResult {
        data,
        mime_type: "image/png".into(),
        width: img_w,
        height: img_h,
    })
}

// ============================================================================
// Helpers
// ============================================================================

fn base64_encode(bytes: &[u8]) -> String {
    use std::io::Write;
    let mut buf = Vec::with_capacity(bytes.len() * 4 / 3 + 4);
    let engine = base64::engine::general_purpose::STANDARD;
    let mut encoder = base64::write::EncoderWriter::new(&mut buf, &engine);
    encoder.write_all(bytes).unwrap();
    drop(encoder);
    unsafe { String::from_utf8_unchecked(buf) }
}

fn get_image_size(path: &str) -> (u32, u32) {
    // Пробуем identify (ImageMagick)
    if let Ok(output) = Command::new("identify")
        .args(["-format", "%w %h", path])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
            if parts.len() == 2 {
                if let (Ok(w), Ok(h)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    return (w, h);
                }
            }
        }
    }
    (0, 0)
}
