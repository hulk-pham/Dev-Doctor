use regex::Regex;
use serde_json::Value;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

const DENIED_PREFIXES: &[&str] = &[
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/Library",
    "/Applications",
    "/dev",
    "/etc",
    "/private/etc",
    "/private/var/root",
    "/var/root",
];

pub const ALLOWED_AI_HOSTS: &[&str] = &[
    "https://api.openai.com",
    "https://api.anthropic.com",
    "https://generativelanguage.googleapis.com",
    "http://127.0.0.1:11434",
    "http://localhost:11434",
    "https://api.groq.com",
    "https://api.together.xyz",
    "https://openrouter.ai",
    "https://openrouter.ai/api/v1/chat/completions",
];

fn is_allowed_azure_openai_url(url: &str) -> bool {
    url.starts_with("https://") && url.contains(".openai.azure.com/")
}

pub const ALLOWED_URLS: &[&str] = &[
    "https://nodejs.org/en/download",
    "https://nodejs.org/api/packages.html#engines",
    "https://docs.npmjs.com/cli/commands/npm-install",
    "https://pnpm.io/installation",
    "https://git-scm.com/downloads",
    "https://github.com/hulk-pham/Dev-Doctor/releases",
];

pub struct FixSpec {
    pub program: &'static str,
    pub args: &'static [&'static str],
    pub display: &'static str,
    pub timeout: Duration,
    pub uses_shell: bool,
}

pub fn validate_project_path(input: &str) -> Result<PathBuf, String> {
    if input.trim().is_empty() {
        return Err("Choose a project folder.".into());
    }
    if input.contains('\0') {
        return Err("The path contains a null byte.".into());
    }
    if !input.starts_with('/') {
        return Err("The project path must be absolute.".into());
    }
    if input.contains(['\n', '\r', ';', '&', '|', '`', '$', '<', '>']) {
        return Err("The path contains characters that are not allowed.".into());
    }
    if Path::new(input)
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("The path must not contain parent directory segments.".into());
    }

    let canonical = Path::new(input).canonicalize().map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => "That folder does not exist.".to_string(),
        std::io::ErrorKind::PermissionDenied => "Permission denied while opening that folder.".to_string(),
        _ => format!("Could not open that folder: {error}"),
    })?;
    if !canonical.is_dir() {
        return Err("Select a folder, not a file.".into());
    }
    if is_denied(&canonical) {
        return Err("That system location cannot be scanned.".into());
    }
    Ok(canonical)
}

pub fn validate_fix_path(input: &str) -> Result<PathBuf, String> {
    let path = validate_project_path(input)?;
    if !is_fix_allowed(&path) {
        return Err("Install commands can only run inside a user or temporary folder.".into());
    }
    Ok(path)
}

pub fn ensure_allowed_ai_host(url: &str) -> Result<(), String> {
    #[cfg(test)]
    {
        let lower = url.to_lowercase();
        if lower.starts_with("http://127.0.0.1:") || lower.starts_with("http://localhost:") {
            return Ok(());
        }
    }
    if ALLOWED_AI_HOSTS.iter().any(|prefix| url.starts_with(prefix)) {
        return Ok(());
    }
    if is_allowed_azure_openai_url(url) {
        return Ok(());
    }
    Err("That AI provider host is not allowlisted.".into())
}

pub fn validate_ollama_endpoint(url: &str) -> Result<(), String> {
    let lower = url.trim().to_lowercase();
    if lower.starts_with("http://127.0.0.1") || lower.starts_with("http://localhost") {
        return Ok(());
    }
    Err("Ollama endpoint must use http://127.0.0.1 or http://localhost.".into())
}

pub fn validate_azure_resource_endpoint(base_url: &str) -> Result<(), String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if !trimmed.starts_with("https://") {
        return Err("Azure endpoint must start with https://.".into());
    }
    if !trimmed.contains(".openai.azure.com") {
        return Err("Azure endpoint must be your *.openai.azure.com resource URL.".into());
    }
    Ok(())
}

pub fn ensure_allowed_url(url: &str) -> Result<(), String> {
    if ALLOWED_URLS.contains(&url) || is_release_tag_url(url) {
        Ok(())
    } else {
        Err("That URL is not in the documentation allowlist.".into())
    }
}

fn is_release_tag_url(url: &str) -> bool {
    let Some(tag) = url.strip_prefix("https://github.com/hulk-pham/Dev-Doctor/releases/tag/") else {
        return false;
    };
    !tag.is_empty()
        && tag
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_'))
}

pub fn resolve_fix(action: &str) -> Result<FixSpec, String> {
    match action {
        "npm-install" => Ok(FixSpec {
            program: "npm",
            args: &["install", "--ignore-scripts"],
            display: "npm install --ignore-scripts",
            timeout: Duration::from_secs(180),
            uses_shell: false,
        }),
        "pnpm-install" => Ok(FixSpec {
            program: "pnpm",
            args: &["install", "--ignore-scripts"],
            display: "pnpm install --ignore-scripts",
            timeout: Duration::from_secs(180),
            uses_shell: false,
        }),
        _ => Err("This action is not allowlisted.".into()),
    }
}

pub fn redact(input: &str) -> String {
    assignment_regex()
        .replace_all(input, "$1=[redacted]")
        .to_string()
}

pub fn sanitize_json(value: &mut Value) {
    match value {
        Value::String(text) => *text = redact(text),
        Value::Array(items) => items.iter_mut().for_each(sanitize_json),
        Value::Object(map) => {
            map.retain(|key, _| {
                let lower = key.to_ascii_lowercase();
                lower != "value" && lower != "secret" && lower != "password" && lower != "token"
            });
            for child in map.values_mut() {
                sanitize_json(child);
            }
        }
        _ => {}
    }
}

pub fn is_safe_package_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 214 || name.contains(['\0', '\\', '\n', '\r']) {
        return false;
    }
    if name.starts_with('/') || name.starts_with('.') {
        return false;
    }
    name.split('/').all(|part| !part.is_empty() && part != "." && part != "..")
}

fn assignment_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\s]+)").expect("assignment regex"))
}

fn is_denied(path: &Path) -> bool {
    let Some(text) = path.to_str() else {
        return true;
    };
    if text == "/" || text == "/private" {
        return true;
    }
    DENIED_PREFIXES
        .iter()
        .any(|prefix| text == *prefix || text.starts_with(&format!("{prefix}/")))
}

fn is_fix_allowed(path: &Path) -> bool {
    let Some(text) = path.to_str() else {
        return false;
    };
    [
        "/Users/",
        "/Volumes/",
        "/tmp/",
        "/private/tmp/",
        "/var/folders/",
        "/private/var/folders/",
    ]
    .iter()
    .any(|prefix| text.starts_with(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_unsafe_paths() {
        assert!(validate_project_path("").is_err());
        assert!(validate_project_path("relative/app").is_err());
        assert!(validate_project_path("/").is_err());
        assert!(validate_project_path("/Users/ada/../etc").is_err());
        assert!(validate_project_path("/usr/local").is_err());
        assert!(validate_project_path("/tmp/dev\0").is_err());
        assert!(validate_project_path("/Users/ada/app; rm -rf /").is_err());
    }

    #[test]
    fn accepts_a_user_or_temp_directory() {
        let temp = std::env::temp_dir();
        let dir = temp.join(format!("dev-doctor-path-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let canonical = validate_project_path(&dir.to_string_lossy()).unwrap();
        assert!(canonical.is_dir());
        assert!(validate_fix_path(&dir.to_string_lossy()).is_ok());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn fix_allowlist_is_not_a_shell() {
        let npm = resolve_fix("npm-install").unwrap();
        assert_eq!(npm.program, "npm");
        assert_eq!(npm.args, ["install", "--ignore-scripts"]);
        assert_eq!(npm.display, "npm install --ignore-scripts");
        assert!(!npm.uses_shell);
        assert!(resolve_fix("rm").is_err());
        assert!(resolve_fix("npm-install && rm -rf /").is_err());
        assert!(resolve_fix("git reset --hard").is_err());
        assert!(ensure_allowed_url("https://nodejs.org/en/download").is_ok());
        assert!(ensure_allowed_url("https://example.com").is_err());
        assert!(ensure_allowed_url("https://github.com/hulk-pham/Dev-Doctor/releases/tag/v0.3.0").is_ok());
        assert!(ensure_allowed_url("https://github.com/hulk-pham/Dev-Doctor/releases/tag/v0.3.0/../../other").is_err());
    }

    #[test]
    fn redacts_secret_assignments() {
        let redacted = redact("DATABASE_URL=sample-secret-do-not-use");
        assert_eq!(redacted, "DATABASE_URL=[redacted]");
        assert!(!redacted.contains("sample-secret-do-not-use"));
        let mut value = serde_json::json!({"token": "DATABASE_URL=sample-secret-do-not-use", "password": "nope"});
        sanitize_json(&mut value);
        let dumped = value.to_string();
        assert!(!dumped.contains("sample-secret-do-not-use"));
        assert!(value.get("password").is_none());
    }

    #[test]
    fn rejects_path_traversal_package_names() {
        assert!(!is_safe_package_name("../etc/passwd"));
        assert!(!is_safe_package_name("/tmp/evil"));
        assert!(is_safe_package_name("@scope/pkg"));
        assert!(is_safe_package_name("left-pad"));
    }
}
