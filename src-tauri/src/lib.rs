// The Mac app: a native window around the same web app as the website, plus the
// plugins it uses for what browsers can't do (see src/native.ts).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .run(tauri::generate_context!())
    .expect("error while running Photobook Sequencer");
}
