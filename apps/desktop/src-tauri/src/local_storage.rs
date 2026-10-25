use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageRequest {
    op: String,
    #[serde(default)]
    path: String,
    create: Option<bool>,
    recursive: Option<bool>,
    offset: Option<u64>,
    length: Option<usize>,
    data: Option<String>,
    target: Option<String>,
}

fn root() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    executable.parent().ok_or("Application directory unavailable".into()).and_then(|p| {
        p.canonicalize().map_err(|e| e.to_string())
    })
}

// Only the owned repository is exposed, never arbitrary paths in the install.
fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    if relative.contains('\\') || relative.contains(':') || relative.contains('\0') {
        return Err("Invalid repository path".into());
    }
    let parts: Vec<_> = Path::new(relative).components().collect();
    if parts.first() != Some(&Component::Normal(".soqaro".as_ref()))
        || parts.iter().any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Path must stay inside .soqaro".into());
    }
    let mut path = root.to_path_buf();
    for part in parts {
        path.push(part);
        if let Ok(metadata) = fs::symlink_metadata(&path) {
            if metadata.file_type().is_symlink() || !path.canonicalize().map_err(|e| e.to_string())?.starts_with(root) {
                return Err("Linked repository paths are not supported".into());
            }
        }
    }
    Ok(path)
}

fn entry(path: &Path) -> Result<Value, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    Ok(json!({
        "name": path.file_name().unwrap_or_default().to_string_lossy(),
        "kind": if metadata.is_dir() { "directory" } else { "file" },
        "size": metadata.len(),
        "modified": metadata.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|t| t.as_millis()).unwrap_or(0)
    }))
}

fn execute(request: StorageRequest) -> Result<Value, String> {
    let root = root()?;
    if request.op == "root" {
        return Ok(json!({ "path": root.to_string_lossy() }));
    }
    let path = resolve(&root, &request.path)?;
    let io_error = |error: std::io::Error| error.to_string();
    match request.op.as_str() {
        "directory" => {
            if request.create == Some(true) { fs::create_dir_all(&path).map_err(io_error)?; }
            if !path.is_dir() { return Err("Directory not found".into()); }
        }
        "file" => {
            if request.create == Some(true) {
                OpenOptions::new().write(true).create(true).truncate(false).open(&path).map_err(io_error)?;
            }
            if !path.is_file() { return Err("File not found".into()); }
        }
        "stat" => return Ok(json!({ "entry": entry(&path)? })),
        "list" => {
            let mut entries = Vec::new();
            for child in fs::read_dir(&path).map_err(io_error)? {
                let child = child.map_err(io_error)?;
                if child.file_type().map_err(io_error)?.is_symlink() { continue; }
                entries.push(entry(&child.path())?);
            }
            return Ok(json!({ "entries": entries }));
        }
        "read" => {
            let mut file = fs::File::open(&path).map_err(io_error)?;
            file.seek(SeekFrom::Start(request.offset.unwrap_or(0))).map_err(io_error)?;
            let mut bytes = Vec::new();
            file.take(request.length.unwrap_or(262144).min(262144) as u64).read_to_end(&mut bytes).map_err(io_error)?;
            return Ok(json!({ "data": STANDARD.encode(&bytes) }));
        }
        "write" => {
            if !request.path.contains(".writing-") { return Err("Write requires a staged file".into()); }
            let bytes = STANDARD.decode(request.data.ok_or("Missing data")?).map_err(|e| e.to_string())?;
            if bytes.len() > 262144 { return Err("Write chunk too large".into()); }
            let mut file = OpenOptions::new().write(true).open(&path).map_err(io_error)?;
            file.seek(SeekFrom::Start(request.offset.unwrap_or(0))).map_err(io_error)?;
            file.write_all(&bytes).map_err(io_error)?;
        }
        "commit" => {
            let target = request.target.ok_or("Missing target")?;
            if !request.path.starts_with(&format!("{target}.writing-")) { return Err("Invalid staged file".into()); }
            fs::rename(&path, resolve(&root, &target)?).map_err(io_error)?;
        }
        "remove" => {
            if request.path == ".soqaro" { return Err("Cannot remove repository root".into()); }
            if path.is_dir() {
                if request.recursive == Some(true) { fs::remove_dir_all(&path).map_err(io_error)?; }
                else { fs::remove_dir(&path).map_err(io_error)?; }
            } else if path.exists() { fs::remove_file(&path).map_err(io_error)?; }
        }
        _ => return Err("Unknown storage operation".into()),
    }
    Ok(json!({}))
}

#[tauri::command]
pub async fn local_storage(window: tauri::WebviewWindow, request: StorageRequest) -> Result<Value, String> {
    let url = window.url().map_err(|e| e.to_string())?;
    let scheme = url.scheme();
    let host = url.host_str().unwrap_or_default();
    let is_trusted = scheme == "tauri"
        || (scheme == "https" && (host == "soqaro.witw.top" || host == "localhost" || host == "tauri.localhost"))
        || (scheme == "http" && (host == "localhost" || host == "tauri.localhost" || host == "127.0.0.1"));
    if window.label() != "main" || !is_trusted {
        return Err("Storage is only available to the main Soqaro Lite window".into());
    }
    tauri::async_runtime::spawn_blocking(move || execute(request)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_stay_inside_owned_repository() {
        let root = std::env::temp_dir();
        assert!(resolve(&root, "../music.mp3").is_err());
        assert!(resolve(&root, "music.mp3").is_err());
        assert!(resolve(&root, ".soqaro/../music.mp3").is_err());
        assert!(resolve(&root, ".soqaro/library/song.mp3").is_ok());
    }
}
