use crate::security::validate_project_path;
use serde::Serialize;
use std::fs;
use std::path::Path;

const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    "coverage",
    "venv",
    ".venv",
    "__pycache__",
    "Pods",
    "DerivedData",
    ".turbo",
    ".cache",
];

const MAX_VISITS: usize = 150;
const MAX_DEPTH: usize = 3;
const MAX_PROJECTS: usize = 24;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChildProject {
    pub name: String,
    pub path: String,
    pub ecosystem: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FolderLayout {
    pub kind: String,
    pub canonical_path: String,
    pub ecosystem: Option<String>,
    pub projects: Vec<ChildProject>,
    pub truncated: bool,
}

pub fn has_node_marker(dir: &Path) -> bool {
    ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"]
        .iter()
        .any(|name| dir.join(name).is_file())
}

pub fn ecosystem_at(dir: &Path) -> Option<&'static str> {
    let mut kinds: Vec<&'static str> = Vec::new();
    let has = |name: &str| dir.join(name).is_file();
    if has_node_marker(dir) {
        kinds.push("node");
    }
    if has("Cargo.toml") {
        kinds.push("rust");
    }
    if has("pyproject.toml") || has("Pipfile") || has("setup.py") || has("requirements.txt") {
        kinds.push("python");
    }
    if has("go.mod") {
        kinds.push("go");
    }
    if has("Gemfile") {
        kinds.push("ruby");
    }
    if has("composer.json") {
        kinds.push("php");
    }
    if has("pom.xml") || has("build.gradle") || has("build.gradle.kts") {
        kinds.push("jvm");
    }
    if has("Package.swift") {
        kinds.push("swift");
    }
    match kinds.len() {
        0 => None,
        1 => Some(kinds[0]),
        _ => Some("mixed"),
    }
}

pub fn classify_folder(project_path: &str) -> Result<FolderLayout, String> {
    let root = validate_project_path(project_path)?;
    let canonical_path = root.to_string_lossy().to_string();
    if let Some(ecosystem) = ecosystem_at(&root) {
        return Ok(FolderLayout {
            kind: "source".into(),
            canonical_path,
            ecosystem: Some(ecosystem.to_string()),
            projects: Vec::new(),
            truncated: false,
        });
    }

    let mut projects = Vec::new();
    let mut visits = 0;
    let mut truncated = false;
    walk(&root, MAX_DEPTH, &mut visits, &mut projects, &mut truncated);

    let kind = if truncated && !projects.is_empty() {
        "boundary"
    } else if projects.len() >= 2 {
        "boundary"
    } else if projects.len() == 1 {
        "nested"
    } else {
        "not-source"
    };

    Ok(FolderLayout {
        kind: kind.into(),
        canonical_path,
        ecosystem: None,
        projects,
        truncated,
    })
}

fn walk(dir: &Path, depth: usize, visits: &mut usize, projects: &mut Vec<ChildProject>, truncated: &mut bool) {
    if depth == 0 || *truncated {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut nested = Vec::new();
    for entry in entries.flatten() {
        if *visits >= MAX_VISITS || projects.len() >= MAX_PROJECTS {
            *truncated = true;
            return;
        }
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            continue;
        }
        *visits += 1;
        let path = entry.path();
        if let Some(ecosystem) = ecosystem_at(&path) {
            projects.push(ChildProject {
                name,
                path: path.to_string_lossy().to_string(),
                ecosystem: ecosystem.to_string(),
            });
        } else {
            nested.push(path);
        }
    }
    for path in nested {
        walk(&path, depth - 1, visits, projects, truncated);
        if *truncated {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn scratch(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dev-doctor-layout-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn source_root_is_not_a_boundary_even_with_child_projects() {
        let dir = scratch("monorepo");
        fs::write(dir.join("package.json"), "{}\n").unwrap();
        fs::create_dir_all(dir.join("packages/web")).unwrap();
        fs::write(dir.join("packages/web/package.json"), "{}\n").unwrap();
        let layout = classify_folder(&dir.to_string_lossy()).unwrap();
        assert_eq!(layout.kind, "source");
        assert_eq!(layout.ecosystem.as_deref(), Some("node"));
        assert!(layout.projects.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn two_child_projects_are_a_boundary() {
        let dir = scratch("boundary");
        fs::create_dir_all(dir.join("web")).unwrap();
        fs::create_dir_all(dir.join("api")).unwrap();
        fs::write(dir.join("web/package.json"), "{}\n").unwrap();
        fs::write(dir.join("api/Cargo.toml"), "[package]\nname = \"api\"\n").unwrap();
        let layout = classify_folder(&dir.to_string_lossy()).unwrap();
        assert_eq!(layout.kind, "boundary");
        assert_eq!(layout.projects.len(), 2);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_single_nested_project_is_opened_deeper() {
        let dir = scratch("nested");
        fs::create_dir_all(dir.join("apps/web")).unwrap();
        fs::write(dir.join("apps/web/package.json"), "{}\n").unwrap();
        let layout = classify_folder(&dir.to_string_lossy()).unwrap();
        assert_eq!(layout.kind, "nested");
        assert_eq!(layout.projects.len(), 1);
        assert_eq!(layout.projects[0].name, "web");
        assert_eq!(layout.projects[0].ecosystem, "node");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn node_modules_does_not_count_as_a_project() {
        let dir = scratch("modules");
        fs::create_dir_all(dir.join("node_modules/left-pad")).unwrap();
        fs::write(dir.join("node_modules/left-pad/package.json"), "{}\n").unwrap();
        let layout = classify_folder(&dir.to_string_lossy()).unwrap();
        assert_eq!(layout.kind, "not-source");
        assert!(layout.projects.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rust_manifest_is_source_without_node() {
        let dir = scratch("rust");
        fs::write(dir.join("Cargo.toml"), "[package]\nname = \"demo\"\n").unwrap();
        let layout = classify_folder(&dir.to_string_lossy()).unwrap();
        assert_eq!(layout.kind, "source");
        assert_eq!(layout.ecosystem.as_deref(), Some("rust"));
        let _ = fs::remove_dir_all(dir);
    }
}
