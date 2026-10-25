//! System media player integration for macOS (Now Playing) and Linux (MPRIS).
//!
//! Windows is intentionally excluded: WebView2 already forwards the page's
//! Media Session API to SMTC, so a second registration here would create a
//! duplicate system entry. Commands run on Tauri's async runtime while the
//! controls are created in `setup`; souvlaki 0.8 declares `MediaControls` as
//! `Send + Sync` and serializes backend access itself (the macOS backend
//! dispatches onto the main queue), so a plain mutex is sufficient.

use std::sync::Mutex;
use std::time::Duration;

use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use tauri::{AppHandle, Emitter, Manager};

pub struct SystemMediaState(Mutex<Option<MediaControls>>);

pub fn init(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let hwnd = app
        .get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as isize as *mut std::ffi::c_void);

    #[cfg(not(target_os = "windows"))]
    let hwnd = None;

    let config = PlatformConfig {
        dbus_name: "soqaro",
        display_name: "Soqaro",
        hwnd,
    };
    let mut controls = MediaControls::new(config).map_err(|error| error.to_string())?;
    let handle = app.clone();
    controls
        .attach(move |event| {
            if let Some(payload) = event_payload(&event) {
                let _ = handle.emit("system-media-command", payload);
            }
        })
        .map_err(|error| error.to_string())?;
    app.manage(SystemMediaState(Mutex::new(Some(controls))));
    Ok(())
}

fn event_payload(event: &MediaControlEvent) -> Option<serde_json::Value> {
    let value = match event {
        MediaControlEvent::Play => serde_json::json!({ "action": "play" }),
        MediaControlEvent::Pause => serde_json::json!({ "action": "pause" }),
        MediaControlEvent::Toggle => serde_json::json!({ "action": "toggle" }),
        MediaControlEvent::Next => serde_json::json!({ "action": "next" }),
        MediaControlEvent::Previous => serde_json::json!({ "action": "prev" }),
        // The player has no dedicated stop state; treat Stop as pause.
        MediaControlEvent::Stop => serde_json::json!({ "action": "pause" }),
        MediaControlEvent::Seek(direction) => serde_json::json!({
            "action": "seekBy",
            "deltaMs": seek_delta_ms(*direction, 10_000)
        }),
        MediaControlEvent::SeekBy(direction, amount) => serde_json::json!({
            "action": "seekBy",
            "deltaMs": seek_delta_ms(*direction, amount.as_millis() as i64)
        }),
        MediaControlEvent::SetPosition(position) => serde_json::json!({
            "action": "seekTo",
            "positionMs": position.0.as_millis() as u64,
        }),
        _ => return None,
    };
    Some(value)
}

fn seek_delta_ms(direction: SeekDirection, magnitude_ms: i64) -> i64 {
    match direction {
        SeekDirection::Forward => magnitude_ms,
        SeekDirection::Backward => -magnitude_ms,
    }
}

fn with_controls<F>(app: &AppHandle, operation: F)
where
    F: FnOnce(&mut MediaControls),
{
    if let Some(state) = app.try_state::<SystemMediaState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(controls) = guard.as_mut() {
                operation(controls);
            }
        }
    }
}

pub fn update_metadata(
    app: &AppHandle,
    title: &str,
    artist: Option<&str>,
    album: Option<&str>,
    cover_url: Option<&str>,
    duration_secs: Option<f64>,
) {
    with_controls(app, |controls| {
        let _ = controls.set_metadata(MediaMetadata {
            title: Some(title),
            artist,
            album,
            cover_url,
            duration: duration_secs
                .filter(|seconds| *seconds >= 0.0)
                .map(Duration::from_secs_f64),
        });
    });
}

pub fn update_playback(app: &AppHandle, is_playing: bool, position_ms: f64) {
    with_controls(app, |controls| {
        let progress = Some(MediaPosition(Duration::from_millis(
            position_ms.max(0.0) as u64
        )));
        let _ = controls.set_playback(if is_playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        });
    });
}

pub fn clear(app: &AppHandle) {
    with_controls(app, |controls| {
        let _ = controls.set_playback(MediaPlayback::Stopped);
    });
}
