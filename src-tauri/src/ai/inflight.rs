use std::sync::Mutex;
use tauri::async_runtime::JoinHandle;

/// Abort handle for the latest AI chat/diagnose HTTP task.
pub struct AiInflight(Mutex<Option<JoinHandle<()>>>);

impl AiInflight {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }

    pub fn cancel(&self) {
        if let Some(handle) = self.0.lock().expect("inflight lock").take() {
            handle.abort();
        }
    }

    pub fn track(&self, handle: JoinHandle<()>) {
        let mut guard = self.0.lock().expect("inflight lock");
        if let Some(previous) = guard.replace(handle) {
            previous.abort();
        }
    }

    pub fn clear(&self) {
        let _ = self.0.lock().expect("inflight lock").take();
    }
}
