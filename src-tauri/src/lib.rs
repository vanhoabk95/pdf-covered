use std::path::Path;

/// Upper bound for files we are willing to load into memory.
const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;

/// Reads a PDF chosen by the user (dialog or drag-and-drop) and returns raw bytes.
/// Kept intentionally thin: all PDF processing happens in the frontend workers.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<tauri::ipc::Response, String> {
    let p = Path::new(&path);
    let is_pdf = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);
    if !is_pdf {
        return Err("Only .pdf files can be opened.".into());
    }
    let meta = std::fs::metadata(p).map_err(|e| format!("Cannot access file: {e}"))?;
    if !meta.is_file() {
        return Err("The selected path is not a file.".into());
    }
    if meta.len() > MAX_PDF_BYTES {
        return Err("The file is too large to open (limit 512 MB).".into());
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Cannot read file: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_pdf_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
