use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromeButton {
    pub name: &'static str,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowChrome {
    pub buttons: Vec<ChromeButton>,
    pub content_height: f64,
}

pub fn measure(window: tauri::WebviewWindow) -> Result<WindowChrome, String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .clone()
        .run_on_main_thread(move || {
            let _ = sender.send(measure_on_main(&window));
        })
        .map_err(|error| error.to_string())?;
    receiver.recv().map_err(|error| error.to_string())?
}

fn measure_on_main(window: &tauri::WebviewWindow) -> Result<WindowChrome, String> {
    #[cfg(target_os = "macos")]
    {
        measure_macos(window)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Err("Window chrome metrics are only available on macOS.".into())
    }
}

#[cfg(target_os = "macos")]
fn measure_macos(window: &tauri::WebviewWindow) -> Result<WindowChrome, String> {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::{NSPoint, NSRect};

    let pointer = window.ns_window().map_err(|error| error.to_string())?;
    if pointer.is_null() {
        return Err("The native window is not available.".into());
    }
    let ns_window = unsafe { &*pointer.cast::<NSWindow>() };
    let content = ns_window
        .contentView()
        .ok_or("The window has no content view.")?;
    let content_height = content.frame().size.height;

    let buttons = [
        ("close", NSWindowButton::CloseButton),
        ("minimize", NSWindowButton::MiniaturizeButton),
        ("zoom", NSWindowButton::ZoomButton),
    ];
    let mut measured = Vec::new();
    for (name, kind) in buttons {
        let Some(button) = ns_window.standardWindowButton(kind) else {
            continue;
        };
        let bounds = NSRect {
            origin: NSPoint { x: 0.0, y: 0.0 },
            size: button.frame().size,
        };
        let rect = button.convertRect_toView(bounds, None);
        measured.push(ChromeButton {
            name,
            x: rect.origin.x,
            y: content_height - (rect.origin.y + rect.size.height),
            width: rect.size.width,
            height: rect.size.height,
        });
    }
    if measured.is_empty() {
        return Err("The window controls could not be measured.".into());
    }
    Ok(WindowChrome {
        buttons: measured,
        content_height,
    })
}
