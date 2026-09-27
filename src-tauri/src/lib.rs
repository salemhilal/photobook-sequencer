// The Mac app: a native window around the same web app as the website, plus what
// browsers can't do: the plugins (see src/native.ts) and project files (src/document.ts).

use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
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

/// Saves in progress. The page sends a project in pieces (it can be hundreds of
/// megabytes); they go to a temporary file, which then replaces the target in one step.
#[derive(Default)]
struct Saves {
  next: AtomicU32,
  open: Mutex<HashMap<u32, (PathBuf, File)>>,
}

#[tauri::command]
fn begin_save(saves: tauri::State<Saves>) -> Result<u32, String> {
  let id = saves.next.fetch_add(1, Ordering::Relaxed);
  let temp = std::env::temp_dir().join(format!("photobook-save-{}-{id}.tmp", std::process::id()));
  let file = File::create(&temp).map_err(|e| e.to_string())?;
  saves.open.lock().unwrap().insert(id, (temp, file));
  Ok(id)
}

/// The next piece of a save: the raw bytes are the request body, the save's id a header.
#[tauri::command]
fn append_save(request: Request, saves: tauri::State<Saves>) -> Result<(), String> {
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("expected the file's contents".into());
  };
  let id: u32 = request
    .headers()
    .get("save")
    .and_then(|v| v.to_str().ok())
    .and_then(|v| v.parse().ok())
    .ok_or("missing save id")?;
  let mut open = saves.open.lock().unwrap();
  let (_, file) = open.get_mut(&id).ok_or("unknown save")?;
  file.write_all(bytes).map_err(|e| e.to_string())
}

/// Put the finished file in place (or, without a path, abandon the save).
#[tauri::command]
fn finish_save(id: u32, path: Option<String>, saves: tauri::State<Saves>) -> Result<(), String> {
  let (temp, file) = saves.open.lock().unwrap().remove(&id).ok_or("unknown save")?;
  let result = match path {
    Some(path) => file
      .sync_all()
      .and_then(|_| std::fs::copy(&temp, path))
      .map(|_| ())
      .map_err(|e| e.to_string()),
    None => Ok(()),
  };
  drop(file);
  let _ = std::fs::remove_file(&temp);
  result
}

/// The end-to-end test's hooks (npm run test:app; see src/e2e.ts). Not in the real app.
#[cfg(feature = "e2e")]
mod e2e {
  /// Where the test's fixtures are, when the app was started to run it.
  #[tauri::command]
  pub fn e2e_dir() -> Option<String> {
    std::env::var("PBS_E2E").ok()
  }

  #[tauri::command]
  pub fn e2e_finish(ok: bool, report: String) {
    println!("{report}");
    std::process::exit(if ok { 0 } else { 1 });
  }
}

#[cfg(not(feature = "e2e"))]
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
  tauri::generate_handler![take_opened_files, read_project, begin_save, append_save, finish_save]
}

#[cfg(feature = "e2e")]
fn handlers() -> impl Fn(tauri::ipc::Invoke) -> bool + Send + Sync + 'static {
  tauri::generate_handler![
    take_opened_files,
    read_project,
    begin_save,
    append_save,
    finish_save,
    e2e::e2e_dir,
    e2e::e2e_finish
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .manage(OpenedFiles::default())
    .manage(Saves::default())
    .invoke_handler(handlers())
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
