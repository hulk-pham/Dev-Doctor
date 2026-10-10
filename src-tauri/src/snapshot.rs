use crate::probe::{clip, probe_version, run_command, CommandError, ToolProbe};
use crate::security::{is_safe_package_name, redact};
use serde::Serialize;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageJsonSnapshot {
    pub present: bool,
    pub parse_error: Option<String>,
    pub read_error: Option<String>,
    pub name: Option<String>,
    pub engines_node: Option<String>,
    pub engines_node_error: Option<String>,
    pub dependency_names: Vec<String>,
    pub dev_dependency_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSnapshot {
    pub example_file: Option<String>,
    pub example_keys: Vec<String>,
    pub example_read_error: Option<String>,
    pub example_unparsed_lines: u32,
    pub env_file_exists: bool,
    pub env_keys: Vec<String>,
    pub env_read_error: Option<String>,
    pub env_unparsed_lines: u32,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub git_available: bool,
    pub is_repo: bool,
    pub branch: Option<String>,
    pub porcelain: Option<String>,
    pub porcelain_truncated: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSnapshot {
    pub canonical_path: String,
    pub folder_name: String,
    pub package_json: PackageJsonSnapshot,
    pub lockfiles: Vec<String>,
    pub node_modules_exists: bool,
    pub missing_dependency_names: Vec<String>,
    pub dependency_check_note: Option<String>,
    pub env: EnvSnapshot,
    pub git: GitSnapshot,
    pub node: ToolProbe,
    pub npm: ToolProbe,
    pub pnpm: ToolProbe,
    pub is_sample: bool,
}

pub fn collect_project_snapshot(project_path: &str) -> Result<ProjectSnapshot, String> {
    let root = crate::security::validate_project_path(project_path)?;
    let folder_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project")
        .to_string();
    let package_json = read_package_json(&root);
    let node_modules_exists = root.join("node_modules").is_dir();
    let (missing_dependency_names, dependency_check_note) =
        missing_dependencies(&root, &package_json, node_modules_exists);
    Ok(ProjectSnapshot {
        canonical_path: root.to_string_lossy().to_string(),
        folder_name,
        lockfiles: lockfiles(&root),
        node_modules_exists,
        missing_dependency_names,
        dependency_check_note,
        env: read_env(&root),
        git: read_git(&root),
        node: probe_version("node"),
        npm: probe_version("npm"),
        pnpm: probe_version("pnpm"),
        is_sample: root.join(".dev-doctor-sample").is_file(),
        package_json,
    })
}

pub fn read_package_json(root: &Path) -> PackageJsonSnapshot {
    let path = root.join("package.json");
    if !path.exists() {
        return empty_package(false, None, None);
    }
    if !path.is_file() {
        return empty_package(true, None, Some("package.json is not a file.".into()));
    }
    let text = match read_text(&path, 2_000_000) {
        Ok(text) => text,
        Err(message) => {
            let friendly = if message == "Permission denied." {
                "Permission denied while reading package.json.".to_string()
            } else {
                format!("Could not read package.json: {message}")
            };
            return empty_package(true, None, Some(friendly));
        }
    };
    let value: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => {
            return empty_package(true, Some("package.json is not valid JSON.".into()), None);
        }
    };
    let serde_json::Value::Object(map) = value else {
        return empty_package(true, Some("package.json must be a JSON object.".into()), None);
    };

    let name = map.get("name").and_then(|value| match value {
        serde_json::Value::String(text) if !text.contains(['\n', '\r']) && text.len() <= 120 => Some(text.clone()),
        serde_json::Value::String(_) => None,
        _ => None,
    });

    let (engines_node, engines_node_error) = match map.get("engines") {
        Some(serde_json::Value::Object(engines)) => match engines.get("node") {
            Some(serde_json::Value::String(range)) => (Some(range.clone()), None),
            Some(_) => (None, Some("engines.node is not a string, so it was not evaluated.".into())),
            None => (None, None),
        },
        Some(_) => (None, Some("engines is not an object, so engines.node was not evaluated.".into())),
        None => (None, None),
    };

    PackageJsonSnapshot {
        present: true,
        parse_error: None,
        read_error: None,
        name,
        engines_node,
        engines_node_error,
        dependency_names: dependency_names(map.get("dependencies")),
        dev_dependency_names: dependency_names(map.get("devDependencies")),
    }
}

pub fn parse_env_keys(contents: &str) -> Result<(Vec<String>, u32), String> {
    if contents.contains('\0') {
        return Err("The file is not valid text.".into());
    }
    let mut keys = Vec::new();
    let mut unparsed = 0u32;
    for raw in contents.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let line = trimmed.strip_prefix("export ").unwrap_or(trimmed).trim();
        let Some((key, _)) = line.split_once('=') else {
            unparsed += 1;
            continue;
        };
        let key = key.trim();
        if !is_env_key(key) {
            unparsed += 1;
            continue;
        }
        if !keys.iter().any(|existing| existing == key) {
            keys.push(key.to_string());
        }
    }
    Ok((keys, unparsed))
}

fn read_env(root: &Path) -> EnvSnapshot {
    let example = root.join(".env.example");
    let sample = root.join(".env.sample");
    let mut note = None;
    let chosen = if example.is_file() {
        if sample.is_file() {
            note = Some("Both .env.example and .env.sample exist. Dev Doctor compared .env.example only.".into());
        }
        Some((".env.example".to_string(), example))
    } else if sample.is_file() {
        Some((".env.sample".to_string(), sample))
    } else {
        None
    };

    let (example_file, example_keys, example_read_error, example_unparsed_lines) = match chosen {
        None => (None, Vec::new(), None, 0),
        Some((name, path)) => match read_text(&path, 1_000_000) {
            Ok(text) => match parse_env_keys(&text) {
                Ok((keys, unparsed)) => (Some(name), keys, None, unparsed),
                Err(message) => (Some(name), Vec::new(), Some(message), 0),
            },
            Err(message) => (
                Some(name.clone()),
                Vec::new(),
                Some(format!("Could not read {name}: {message}")),
                0,
            ),
        },
    };

    let env_path = root.join(".env");
    let (env_file_exists, env_keys, env_read_error, env_unparsed_lines) = if !env_path.exists() {
        (false, Vec::new(), None, 0)
    } else if !env_path.is_file() {
        (true, Vec::new(), Some(".env is not a file.".into()), 0)
    } else {
        match read_text(&env_path, 1_000_000) {
            Ok(text) => match parse_env_keys(&text) {
                Ok((keys, unparsed)) => (true, keys, None, unparsed),
                Err(message) => (true, Vec::new(), Some(message), 0),
            },
            Err(message) => (true, Vec::new(), Some(format!("Could not read .env: {message}")), 0),
        }
    };

    EnvSnapshot {
        example_file,
        example_keys,
        example_read_error,
        example_unparsed_lines,
        env_file_exists,
        env_keys,
        env_read_error,
        env_unparsed_lines,
        note,
    }
}

fn read_git(root: &Path) -> GitSnapshot {
    let path = root.to_string_lossy().to_string();
    match run_command(
        "git",
        &["-C", &path, "rev-parse", "--is-inside-work-tree"],
        None,
        std::time::Duration::from_secs(8),
    ) {
        Err(CommandError::NotFound(_)) => {
            return GitSnapshot {
                git_available: false,
                is_repo: false,
                branch: None,
                porcelain: None,
                porcelain_truncated: false,
                error: Some("git was not found on PATH.".into()),
            };
        }
        Err(CommandError::Timeout) => {
            return git_error(true, "git timed out.");
        }
        Err(CommandError::Io(message)) => return git_error(true, &message),
        Ok(output) if !(output.success && output.stdout.trim() == "true") => {
            let stderr = output.stderr.to_lowercase();
            return GitSnapshot {
                git_available: true,
                is_repo: false,
                branch: None,
                porcelain: None,
                porcelain_truncated: false,
                error: if stderr.contains("not a git repository") {
                    None
                } else {
                    Some(redact(&clip(&output.stderr, 240)))
                },
            };
        }
        Ok(_) => {}
    }

    let branch = match run_command(
        "git",
        &["-C", &path, "rev-parse", "--abbrev-ref", "HEAD"],
        None,
        std::time::Duration::from_secs(8),
    ) {
        Ok(output) if output.success => Some(clip(output.stdout.trim(), 120)),
        Ok(output) => {
            return GitSnapshot {
                git_available: true,
                is_repo: true,
                branch: None,
                porcelain: None,
                porcelain_truncated: false,
                error: Some(redact(&clip(&output.stderr, 240))),
            };
        }
        Err(CommandError::Timeout) => return git_error(true, "git timed out while reading the branch."),
        Err(error) => return git_error(true, &command_error_message(error)),
    };

    match run_command(
        "git",
        &["-C", &path, "status", "--porcelain=v1", "--untracked-files=normal", "--", "."],
        None,
        std::time::Duration::from_secs(8),
    ) {
        Ok(output) if output.success => {
            let (porcelain, truncated) = limit_text(&output.stdout, 32_000);
            GitSnapshot {
                git_available: true,
                is_repo: true,
                branch,
                porcelain: Some(porcelain),
                porcelain_truncated: truncated,
                error: None,
            }
        }
        Ok(output) => GitSnapshot {
            git_available: true,
            is_repo: true,
            branch,
            porcelain: None,
            porcelain_truncated: false,
            error: Some(redact(&clip(&output.stderr, 240))),
        },
        Err(error) => GitSnapshot {
            git_available: true,
            is_repo: true,
            branch,
            porcelain: None,
            porcelain_truncated: false,
            error: Some(command_error_message(error)),
        },
    }
}

fn missing_dependencies(
    root: &Path,
    package_json: &PackageJsonSnapshot,
    node_modules_exists: bool,
) -> (Vec<String>, Option<String>) {
    if !package_json.present || package_json.parse_error.is_some() || package_json.read_error.is_some() {
        return (Vec::new(), None);
    }
    if !node_modules_exists {
        return (Vec::new(), None);
    }
    let node_modules = root.join("node_modules");
    if !node_modules.is_dir() {
        return (Vec::new(), Some("node_modules could not be opened.".into()));
    }
    let mut missing = Vec::new();
    let names = package_json
        .dependency_names
        .iter()
        .chain(package_json.dev_dependency_names.iter());
    for name in names {
        if !is_safe_package_name(name) {
            continue;
        }
        if !node_modules.join(name).exists() {
            missing.push(name.clone());
        }
        if missing.len() == 50 {
            break;
        }
    }
    (missing, None)
}

fn lockfiles(root: &Path) -> Vec<String> {
    ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]
        .into_iter()
        .filter(|name| root.join(name).is_file())
        .map(str::to_string)
        .collect()
}

fn dependency_names(value: Option<&serde_json::Value>) -> Vec<String> {
    let Some(serde_json::Value::Object(map)) = value else {
        return Vec::new();
    };
    map.keys()
        .filter(|name| is_safe_package_name(name))
        .take(300)
        .cloned()
        .collect()
}

fn read_text(path: &Path, max_bytes: u64) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| io_message(error.kind()))?;
    if !metadata.is_file() {
        return Err("Expected a file.".into());
    }
    if metadata.len() > max_bytes {
        return Err("The file is too large to read safely.".into());
    }
    let text = fs::read_to_string(path).map_err(|error| io_message(error.kind()))?;
    if text.contains('\0') {
        return Err("The file is not valid text.".into());
    }
    Ok(text)
}

fn io_message(kind: ErrorKind) -> String {
    match kind {
        ErrorKind::PermissionDenied => "Permission denied.".into(),
        ErrorKind::NotFound => "The file was not found.".into(),
        _ => "The file could not be read.".into(),
    }
}

fn is_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    match chars.next() {
        Some(first) if first == '_' || first.is_ascii_alphabetic() => {
            chars.all(|char| char == '_' || char.is_ascii_alphanumeric())
        }
        _ => false,
    }
}

fn empty_package(present: bool, parse_error: Option<String>, read_error: Option<String>) -> PackageJsonSnapshot {
    PackageJsonSnapshot {
        present,
        parse_error,
        read_error,
        name: None,
        engines_node: None,
        engines_node_error: None,
        dependency_names: Vec::new(),
        dev_dependency_names: Vec::new(),
    }
}

fn git_error(git_available: bool, message: &str) -> GitSnapshot {
    GitSnapshot {
        git_available,
        is_repo: false,
        branch: None,
        porcelain: None,
        porcelain_truncated: false,
        error: Some(message.to_string()),
    }
}

fn command_error_message(error: CommandError) -> String {
    match error {
        CommandError::NotFound(name) => format!("{name} was not found on PATH."),
        CommandError::Timeout => "The command timed out.".into(),
        CommandError::Io(message) => message,
    }
}

fn limit_text(input: &str, max: usize) -> (String, bool) {
    if input.len() <= max {
        return (input.to_string(), false);
    }
    let mut end = max;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    if let Some(newline) = input[..end].rfind('\n') {
        end = newline;
    }
    (input[..end].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn parses_env_keys_without_values() {
        let secret = "sample-secret-do-not-use";
        let contents = format!("# comment\nDATABASE_URL={secret}\nexport APP_PORT=3000\nnot a pair\n");
        let (keys, unparsed) = parse_env_keys(&contents).unwrap();
        assert_eq!(keys, vec!["DATABASE_URL", "APP_PORT"]);
        assert_eq!(unparsed, 1);
        assert!(!serde_json::to_string(&keys).unwrap().contains(secret));
    }

    #[test]
    fn fixture_env_does_not_leak() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/sample-node-app/.env");
        let contents = fs::read_to_string(&path).unwrap();
        assert!(contents.contains("sample-secret-do-not-use"));
        let (keys, _) = parse_env_keys(&contents).unwrap();
        let dumped = serde_json::to_string(&keys).unwrap();
        assert!(!dumped.contains("sample-secret-do-not-use"));
        assert!(keys.iter().any(|key| key == "DATABASE_URL"));
        assert!(keys.iter().any(|key| key == "APP_PORT"));
    }

    #[test]
    fn malformed_package_json_is_reported() {
        let dir = std::env::temp_dir().join(format!("dev-doctor-json-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("package.json"), "{").unwrap();
        let snapshot = read_package_json(&dir);
        assert_eq!(snapshot.parse_error.as_deref(), Some("package.json is not valid JSON."));
        assert!(snapshot.dependency_names.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn permission_error_does_not_include_file_contents() {
        let dir = std::env::temp_dir().join(format!("dev-doctor-perm-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("package.json");
        fs::write(&file, r#"{"secret":"sample-secret-do-not-use"}"#).unwrap();
        let mut permissions = fs::metadata(&file).unwrap().permissions();
        permissions.set_mode(0o000);
        fs::set_permissions(&file, permissions).unwrap();
        let snapshot = read_package_json(&dir);
        let mut restore = fs::metadata(&file).unwrap().permissions();
        restore.set_mode(0o644);
        fs::set_permissions(&file, restore).unwrap();
        let dumped = serde_json::to_string(&snapshot).unwrap();
        assert!(snapshot.read_error.is_some());
        assert!(!dumped.contains("sample-secret-do-not-use"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn scans_the_sample_fixture_without_leaking_secrets() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../fixtures/sample-node-app")
            .canonicalize()
            .expect("sample fixture");
        let snapshot = collect_project_snapshot(&path.to_string_lossy()).expect("sample scan");
        let dumped = serde_json::to_string(&snapshot).expect("json");
        assert!(snapshot.is_sample);
        assert!(!snapshot.node_modules_exists);
        assert!(snapshot.lockfiles.iter().any(|file| file == "package-lock.json"));
        assert!(snapshot.lockfiles.iter().any(|file| file == "pnpm-lock.yaml"));
        assert_eq!(snapshot.package_json.engines_node.as_deref(), Some(">=18 <20"));
        assert!(snapshot.env.example_keys.iter().any(|key| key == "API_TOKEN"));
        assert!(snapshot.env.env_keys.iter().any(|key| key == "DATABASE_URL"));
        assert!(!snapshot.env.env_keys.iter().any(|key| key == "API_TOKEN"));
        assert!(!dumped.contains("sample-secret-do-not-use"));
        assert!(snapshot.git.is_repo);
        let porcelain = snapshot.git.porcelain.unwrap_or_default();
        assert!(porcelain.contains("uncommitted.js"));
    }

    #[test]
    fn reads_engines_and_dependency_names_only() {
        let dir = std::env::temp_dir().join(format!("dev-doctor-pkg-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("package.json"),
            r#"{"name":"demo","engines":{"node":">=18 <20"},"dependencies":{"left-pad":"1.3.0","../evil":"1"},"devDependencies":{"typescript":"5.6.3"}}"#,
        )
        .unwrap();
        let snapshot = read_package_json(&dir);
        assert_eq!(snapshot.engines_node.as_deref(), Some(">=18 <20"));
        assert_eq!(snapshot.dependency_names, vec!["left-pad"]);
        assert_eq!(snapshot.dev_dependency_names, vec!["typescript"]);
        assert!(!serde_json::to_string(&snapshot).unwrap().contains("1.3.0"));
        let _ = fs::remove_dir_all(dir);
    }
}
