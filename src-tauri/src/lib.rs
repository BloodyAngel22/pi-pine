mod clipboard;
mod favorites;
mod mcp;
mod paths;
mod plans;
mod rpc;
mod sessions;
mod terminal;
mod themes;
mod virtual_display;

use rpc::RpcManager;
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use virtual_display::VirtualDisplayManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            // favorites + pi settings
            favorites::read_favorites,
            favorites::write_favorites,
            favorites::read_pi_settings,
            favorites::write_pi_settings_partial,
            // sessions
            sessions::list_project_sessions,
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
            plans::ensure_plan_file,
            plans::read_plan_file,
            plans::write_plan_file,
            plans::list_plan_files,
            // RPC bridge
            rpc::rpc_start,
            rpc::rpc_send,
            rpc::rpc_stop,
            rpc::rpc_status,
            // Virtual display
            virtual_display::start_virtual_display,
            virtual_display::stop_virtual_display,
            virtual_display::virtual_display_status,
            virtual_display::screenshot_virtual_display,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
