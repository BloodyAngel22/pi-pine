use std::process::Stdio;
use tauri::command;

/// Проигрывает звук уведомления через `paplay`.
///
/// tauri-plugin-notification на Linux прокидывает поле `sound` в
/// notify-rust::Notification::sound_name(), которое устанавливает
/// D-Bus hint `sound-name` (freedesktop sound naming spec — тема +
/// короткое имя вроде "message-new-instant"), а не `sound-file`.
/// Абсолютный путь к .oga/.wav файлу через этот hint никогда не
/// проигрывается, поэтому кастомный/дефолтный звук уведомления
/// нужно запускать отдельным процессом — так же, как это делает
/// сам pi-mono-x на agent_end (см. core/notify.ts::runSoundHook).
#[command]
pub fn play_notification_sound(path: String) -> Result<(), String> {
    std::process::Command::new("paplay")
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
