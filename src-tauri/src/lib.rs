// The Mac app: a native window around the same web app as the website, plus what
// browsers can't do: the plugins (see src/native.ts) and project files (src/document.ts).

use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager};

/// Files macOS asked the app to open (a double-click in Finder, a drop on the Dock
/// icon) that the page hasn't taken yet. The one that launches the app arrives
/// before the page is ready, so they wait here.
#[derive(Default)]
struct OpenedFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_opened_files(opened: tauri::State<OpenedFiles>) -> Vec<String> {
  std::mem::take(&mut *opened.0.lock().unwrap())
}

/// A project file's contents, as raw bytes (projects can be hundreds of megabytes).
#[tauri::command]
fn read_project(path: String) -> Result<Response, String> {
  std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

/// Write a project file: the raw bytes are the request body, the path a header.
#[tauri::command]
fn write_project(request: Request) -> Result<(), String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("expected the file's contents".into());
  };
  let path = request
    .headers()
    .get("path")
    .and_then(|v| v.to_str().ok())
    .ok_or("missing path")?;
  let path = percent_encoding::percent_decode_str(path)
    .decode_utf8()
    .map_err(|e| e.to_string())?;
  std::fs::write(path.as_ref(), bytes).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .manage(OpenedFiles::default())
    .invoke_handler(tauri::generate_handler![take_opened_files, read_project, write_project])
    .build(tauri::generate_context!())
    .expect("error while building Photobook Sequencer");

  app.run(|handle, event| {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    if let tauri::RunEvent::Opened { urls } = event {
      let paths = urls
        .iter()
        .filter_map(|url| url.to_file_path().ok())
        .map(|path| path.to_string_lossy().into_owned());
      handle.state::<OpenedFiles>().0.lock().unwrap().extend(paths);
      let _ = handle.emit("opened-files", ());
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    let _ = (handle, event);
  });
}
