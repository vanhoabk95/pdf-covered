use std::path::Path;

use tauri::ipc::{InvokeBody, Request};

/// Upper bound for files we are willing to load into memory.
const MAX_PDF_BYTES: u64 = 512 * 1024 * 1024;

/// Reads a PDF chosen by the user (dialog or drag-and-drop) and returns raw bytes.
/// Kept intentionally thin: all PDF processing happens in the frontend workers.
#[tauri::command]
fn read_pdf_file(path: String) -> Result<tauri::ipc::Response, String> {
    let p = Path::new(&path);
    if !has_pdf_extension(p) {
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

fn has_pdf_extension(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false)
}

/// Writes an exported (already redacted and verified) PDF chosen via the save dialog.
/// Body: raw bytes. Header `x-path`: percent-encoded destination path.
#[tauri::command]
fn write_pdf_file(request: Request<'_>) -> Result<(), String> {
    let encoded = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing destination path.")?;
    let path = percent_decode(encoded)?;
    let p = Path::new(&path);
    if !has_pdf_extension(p) {
        return Err("The exported file must have a .pdf extension.".into());
    }
    match p.parent() {
        Some(dir) if dir.as_os_str().is_empty() || dir.is_dir() => {}
        _ => return Err("The destination folder does not exist.".into()),
    }
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary PDF data.".into());
    };
    if !bytes.starts_with(b"%PDF-") {
        return Err("Refusing to write data that is not a PDF.".into());
    }
    // Write to a temporary sibling first so a failure never leaves a truncated file behind.
    let tmp = p.with_extension("pdf.partial");
    std::fs::write(&tmp, bytes).map_err(|e| format!("Cannot write file: {e}"))?;
    std::fs::rename(&tmp, p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("Cannot save file: {e}")
    })
}

fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| "Invalid path encoding.")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Invalid path encoding.")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Invalid path encoding.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_pdf_file, write_pdf_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoded_paths() {
        assert_eq!(percent_decode("%2FUsers%2Fa%20b%2Fb%C3%A1o-c%C3%A1o.pdf").unwrap(), "/Users/a b/báo-cáo.pdf");
        assert_eq!(percent_decode("plain.pdf").unwrap(), "plain.pdf");
        assert!(percent_decode("%zz").is_err());
    }

    #[test]
    fn checks_pdf_extension() {
        assert!(has_pdf_extension(Path::new("a/b.PDF")));
        assert!(!has_pdf_extension(Path::new("a/b.txt")));
    }
}
