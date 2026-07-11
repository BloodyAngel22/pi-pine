mod agents;
mod analyze_image;
mod clipboard;
mod favorites;
mod git_diff;
mod mcp;
mod paths;
mod plans;
mod rpc;
mod rpc_log;
mod sessions;
mod terminal;
mod themes;
mod transcription;
mod virtual_display;

use rpc::RpcManager;
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use virtual_display::VirtualDisplayManager;

/// Tauri поднимает собственный tokio-рантайм лениво при первом обращении, и по
/// умолчанию (`tokio::runtime::Runtime::new()`) заводит по воркер-потоку на
/// каждое логическое ядро. На многоядерных машинах это ощутимо конкурирует
/// за CPU с остальной системой, хотя UI-команды Tauri этого параллелизма не
/// требуют. Ограничиваем половиной ядер (минимум 2), пока не зарегистрирован
/// дефолтный рантайм.
fn build_capped_tokio_runtime() -> tokio::runtime::Runtime {
    let total = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let workers = (total / 2).max(2);
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(workers)
        .enable_all()
        .build()
        .expect("не удалось создать tokio runtime")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = build_capped_tokio_runtime();
    tauri::async_runtime::set(runtime.handle().clone());
    // `async_runtime::set` живёт всё время работы процесса — Runtime не должен
    // быть уничтожен, пока приложение работает, поэтому намеренно не роняем его.
    std::mem::forget(runtime);

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let _window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Pi Pine")
                    .inner_size(1100.0, 720.0)
                    .min_inner_size(720.0, 480.0)
                    .decorations(true)
                    .resizable(true)
                    .theme(Some(tauri::Theme::Dark))
                    .enable_clipboard_access()
                    .build()?;

            // webkit2gtk по умолчанию отклоняет любые permission-request (микрофон,
            // камера и т.д.) — в wry/tauri для Linux этот сигнал никак не обработан,
            // поэтому getUserMedia всегда молча падает независимо от системных настроек.
            // Разрешаем ТОЛЬКО чисто аудио-запросы (голосовой ввод); если запрошено
            // ещё и видео (камера/screen-share) — не трогаем, остаётся дефолтный deny.
            #[cfg(target_os = "linux")]
            {
                use webkit2gtk::glib::prelude::*;
                use webkit2gtk::{
                    PermissionRequestExt, UserMediaPermissionRequest, UserMediaPermissionRequestExt,
                    WebViewExt,
                };
                let _ = _window.with_webview(|webview| {
                    let wv = webview.inner();
                    wv.connect_permission_request(|_wv, request| {
                        if let Some(media_request) = request.downcast_ref::<UserMediaPermissionRequest>() {
                            if media_request.is_for_audio_device() && !media_request.is_for_video_device() {
                                request.allow();
                                return true;
                            }
                        }
                        false
                    });
                });
            }

            let manager = Arc::new(RpcManager::new(app.handle().clone()));
            app.manage(manager);
            app.manage(Arc::new(terminal::TerminalManager::default()));
            app.manage(VirtualDisplayManager::new());
            // Запускаем watcher файла auth.json
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                paths::watch_auth(handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // clipboard
            clipboard::read_clipboard_uri_list,
            clipboard::clipboard_debug,
            // pi binary discovery + paths
            paths::find_pi_binary,
            paths::detect_environment,
            paths::complete_directories,
            paths::parse_cli_cwd,
            paths::open_in_default_app,
            paths::read_auth_status,
            paths::list_themes,
            // themes (full)
            themes::list_themes_full,
            themes::read_theme,
            // mcp
            mcp::read_mcp_config,
            mcp::toggle_mcp_server,
            mcp::write_mcp_server,
            mcp::delete_mcp_server,
            // favorites + pi settings
            favorites::read_favorites,
            favorites::write_favorites,
            favorites::read_pi_settings,
            favorites::write_pi_settings_partial,
            // agent presets
            agents::list_agent_presets,
            agents::read_agent_preset,
            agents::write_agent_preset,
            agents::delete_agent_preset,
            agents::rpc_load_agent_preset,
            agents::get_preset_for_cwd,
            agents::ensure_default_preset,
            // sessions
            sessions::list_project_sessions,
            sessions::get_session_labels,
            sessions::read_last_session_file,
            sessions::write_last_session_file,
            sessions::delete_session_file,
            sessions::rename_session_file,
            sessions::truncate_session_at,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            terminal::terminal_list,
            // plans
            plans::read_plan_file,
            plans::write_plan_file,
            // RPC bridge
            rpc::rpc_start,
            rpc::rpc_send,
            rpc::rpc_stop,
            rpc::rpc_status,
            rpc_log::get_rpc_log_config,
            rpc_log::set_rpc_log_config,
            // analyze-image config
            analyze_image::get_analyze_image_config,
            analyze_image::set_analyze_image_config,
            analyze_image::get_analyze_image_status,
            // git diff
            git_diff::git_diff_status,
            git_diff::git_diff_file,
            // voice transcription (STT)
            transcription::get_transcription_config,
            transcription::set_transcription_config,
            transcription::test_stt_connection,
            transcription::list_transcription_models,
            transcription::transcribe_audio,
            // Virtual display
            virtual_display::start_virtual_display,
            virtual_display::stop_virtual_display,
            virtual_display::virtual_display_status,
            virtual_display::screenshot_virtual_display,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
