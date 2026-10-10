use crate::probe::{run_command, CommandError};
use crate::security::{redact, validate_project_path};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant, UNIX_EPOCH};

const MAX_DEPTH: u32 = 8;
const MAX_ENTRIES: u64 = 200_000;
const MAX_BRANCHES: usize = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RawArtifact {
    pub relative_path: String,
    pub name: String,
    pub kind: String,
    pub bytes: Option<u64>,
    pub modified_ms: Option<u64>,
    pub truncated: bool,
    pub missing: bool,
    pub markers: Vec<String>,
    pub branch: Option<String>,
    pub last_commit_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactScan {
    pub project_path: String,
    pub artifacts: Vec<RawArtifact>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub detail: String,
    pub completed: u32,
    pub total: Option<u32>,
}

#[derive(Clone)]
struct GitWorktree {
    path: String,
    branch: Option<String>,
    prunable: bool,
}

struct GitBranch {
    name: String,
    commit_unix: Option<u64>,
}

struct Candidate {
    path: PathBuf,
    name: String,
    display: String,
    markers: Vec<String>,
}

struct Reporter<'a> {
    emit: &'a mut dyn FnMut(ScanProgress),
    last: Option<Instant>,
}

impl Reporter<'_> {
    fn send(&mut self, progress: ScanProgress, force: bool) {
        let due = self
            .last
            .map(|time| time.elapsed() >= Duration::from_millis(90))
            .unwrap_or(true);
        if !force && !due {
            return;
        }
        self.last = Some(Instant::now());
        (self.emit)(progress);
    }
}

pub fn scan_project_artifacts(
    project_path: &str,
    report: &mut dyn FnMut(ScanProgress),
) -> Result<ArtifactScan, String> {
    let root = validate_project_path(project_path)?;
    let mut reporter = Reporter { emit: report, last: None };
    let mut warnings = Vec::new();
    let mut artifacts = Vec::new();

    reporter.send(step("worktrees", "Reading git worktrees", 0, None), true);
    let layout = match read_layout(&root) {
        Ok(layout) => layout,
        Err(message) => {
            warnings.push(message);
            RepoLayout::default()
        }
    };
    reporter.send(step("branches", "Reading local branches", 0, None), true);
    let checked_out: HashSet<String> = layout
        .worktrees
        .iter()
        .filter(|item| Path::new(&item.path).exists())
        .filter_map(|item| item.branch.clone())
        .collect();

    let mut skip = HashSet::new();
    let mut extra = Vec::new();
    for worktree in layout.worktrees {
        if !Path::new(&worktree.path).exists() {
            artifacts.push(worktree_artifact(&worktree, None, false, true));
            continue;
        }
        match validate_project_path(&worktree.path) {
            Ok(canonical) if canonical == root => {}
            Ok(canonical) => {
                skip.insert(canonical.clone());
                extra.push((canonical, worktree));
            }
            Err(error) => warnings.push(format!("Skipped worktree {}: {error}", worktree.path)),
        }
    }

    let mut candidates = Vec::new();
    collect(&root, &root, 0, &skip, &mut candidates, &mut warnings, &mut reporter);
    for (path, _) in &extra {
        let detail = path.to_string_lossy().to_string();
        reporter.send(step("discovering", &detail, 0, None), true);
        collect(&root, path, 0, &HashSet::new(), &mut candidates, &mut warnings, &mut reporter);
    }

    let total = (candidates.len() + extra.len()) as u32;
    let mut completed = 0_u32;
    for candidate in candidates {
        reporter.send(
            step("measuring", &candidate.display, completed, Some(total.max(1))),
            true,
        );
        let display = candidate.display.clone();
        match measure(&candidate.path, &mut |seen| {
            reporter.send(
                step(
                    "measuring",
                    &format!("{display} · {seen} files"),
                    completed,
                    Some(total.max(1)),
                ),
                false,
            );
        }) {
            Ok((bytes, truncated)) => artifacts.push(directory_artifact(&candidate, bytes, truncated)),
            Err(error) => warnings.push(format!("{}: {error}", candidate.display)),
        }
        completed += 1;
    }
    for (path, worktree) in extra {
        let detail = format!("Measuring checkout {}", path.display());
        reporter.send(step("measuring", &detail, completed, Some(total.max(1))), true);
        match measure(&path, &mut |seen| {
            reporter.send(
                step("measuring", &format!("{detail} · {seen} files"), completed, Some(total.max(1))),
                false,
            );
        }) {
            Ok((bytes, truncated)) => artifacts.push(worktree_artifact(&worktree, Some(bytes), truncated, false)),
            Err(error) => warnings.push(format!("{}: {error}", path.display())),
        }
        completed += 1;
    }

    let mut unused = 0_usize;
    for branch in layout.branches {
        if checked_out.contains(&branch.name) {
            continue;
        }
        if unused == MAX_BRANCHES {
            warnings.push(format!(
                "Stopped after {MAX_BRANCHES} local branches that are not checked out."
            ));
            break;
        }
        artifacts.push(branch_artifact(branch));
        unused += 1;
    }

    reporter.send(
        step("measuring", "Finished reading folders", total, Some(total.max(1))),
        true,
    );
    artifacts.sort_by(|left, right| right.bytes.unwrap_or(0).cmp(&left.bytes.unwrap_or(0)));
    Ok(ArtifactScan {
        project_path: root.to_string_lossy().to_string(),
        artifacts,
        warnings,
    })
}

fn step(phase: &str, detail: &str, completed: u32, total: Option<u32>) -> ScanProgress {
    ScanProgress {
        phase: phase.to_string(),
        detail: detail.to_string(),
        completed,
        total,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogFile {
    rules: Vec<CatalogRule>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogRule {
    paths: Vec<String>,
    #[serde(default)]
    omit_if_unconfirmed: bool,
    #[serde(default)]
    confirm: Option<CatalogConfirm>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CatalogConfirm {
    #[serde(default)]
    files: Vec<String>,
    #[serde(default)]
    globs: Vec<String>,
    #[serde(default)]
    dirs: Vec<String>,
}

struct MarkerSpec {
    files: Vec<String>,
    globs: Vec<String>,
    dirs: Vec<String>,
}

fn catalog() -> &'static CatalogFile {
    static CATALOG: OnceLock<CatalogFile> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../src/diagnostics/artifact-catalog.json"))
            .expect("artifact catalog is valid JSON")
    })
}

fn marker_spec() -> &'static MarkerSpec {
    static SPEC: OnceLock<MarkerSpec> = OnceLock::new();
    SPEC.get_or_init(|| {
        let mut spec = MarkerSpec { files: Vec::new(), globs: Vec::new(), dirs: Vec::new() };
        for rule in &catalog().rules {
            let Some(confirm) = &rule.confirm else { continue };
            for file in &confirm.files {
                if !spec.files.contains(file) {
                    spec.files.push(file.clone());
                }
            }
            for glob in &confirm.globs {
                if !spec.globs.contains(glob) {
                    spec.globs.push(glob.clone());
                }
            }
            for dir in &confirm.dirs {
                if !spec.dirs.contains(dir) {
                    spec.dirs.push(dir.clone());
                }
            }
        }
        spec
    })
}

fn best_rule<'a>(name: &str, relative: &str) -> Option<&'a CatalogRule> {
    let mut best: Option<(&CatalogRule, usize)> = None;
    for rule in &catalog().rules {
        for pattern in &rule.paths {
            if !pattern_matches(pattern, name, relative) {
                continue;
            }
            if best.as_ref().map(|(_, length)| pattern.len() > *length).unwrap_or(true) {
                best = Some((rule, pattern.len()));
            }
        }
    }
    best.map(|(rule, _)| rule)
}

fn pattern_matches(pattern: &str, name: &str, relative: &str) -> bool {
    if let Some(suffix) = pattern.strip_prefix('*') {
        return name.ends_with(suffix);
    }
    if pattern.contains('/') {
        return relative == pattern || relative.ends_with(&format!("/{pattern}"));
    }
    name == pattern
}

fn should_record(rule: &CatalogRule, markers: &[String]) -> bool {
    !(rule.omit_if_unconfirmed && !is_confirmed(rule, markers))
}

fn is_confirmed(rule: &CatalogRule, markers: &[String]) -> bool {
    let Some(confirm) = &rule.confirm else {
        return true;
    };
    let mut tokens: Vec<String> = confirm.files.clone();
    tokens.extend(confirm.globs.clone());
    tokens.extend(confirm.dirs.iter().map(|dir| format!("{dir}/")));
    if tokens.is_empty() {
        return false;
    }
    tokens.iter().any(|token| markers.iter().any(|marker| marker == token))
}

fn markers_for(path: &Path, root: &Path) -> Vec<String> {
    let mut found = Vec::new();
    let mut current = path.parent().map(|dir| dir.to_path_buf());
    while let Some(dir) = current {
        if dir != root && !dir.starts_with(root) {
            break;
        }
        collect_dir_markers(&dir, &mut found);
        if dir == root {
            break;
        }
        current = dir.parent().map(|parent| parent.to_path_buf());
    }
    found
}

fn collect_dir_markers(dir: &Path, found: &mut Vec<String>) {
    let spec = marker_spec();
    for file in &spec.files {
        if dir.join(file).is_file() && !found.iter().any(|item| item == file) {
            found.push(file.clone());
        }
    }
    if spec.globs.is_empty() && spec.dirs.is_empty() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        for dir_name in &spec.dirs {
            let token = format!("{dir_name}/");
            if name == *dir_name && entry.path().is_dir() && !found.contains(&token) {
                found.push(token);
            }
        }
        for glob in &spec.globs {
            let Some(suffix) = glob.strip_prefix('*') else { continue };
            if name.ends_with(suffix) && !found.iter().any(|item| item == glob) {
                found.push(glob.clone());
            }
        }
    }
}

fn collect(
    root: &Path,
    dir: &Path,
    depth: u32,
    skip: &HashSet<PathBuf>,
    candidates: &mut Vec<Candidate>,
    warnings: &mut Vec<String>,
    reporter: &mut Reporter<'_>,
) {
    if depth > MAX_DEPTH {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!(
                "Could not read {}: {error}",
                display_path(root, dir)
            ));
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::symlink_metadata(&path) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name == ".git" {
            continue;
        }
        if !skip.is_empty() {
            if let Ok(canonical) = path.canonicalize() {
                if skip.contains(&canonical) {
                    continue;
                }
            }
        }
        let display = display_path(root, &path);
        reporter.send(step("discovering", &display, 0, None), false);
        let owned_name = name.to_string();
        if let Some(rule) = best_rule(&owned_name, &display) {
            let markers = markers_for(&path, root);
            if should_record(rule, &markers) {
                candidates.push(Candidate {
                    name: owned_name,
                    path,
                    display,
                    markers,
                });
            }
            continue;
        }
        collect(root, &path, depth + 1, skip, candidates, warnings, reporter);
    }
}

fn directory_artifact(candidate: &Candidate, bytes: u64, truncated: bool) -> RawArtifact {
    RawArtifact {
        relative_path: candidate.display.clone(),
        name: candidate.name.clone(),
        kind: "directory".into(),
        bytes: Some(bytes),
        modified_ms: modified_ms(&candidate.path),
        truncated,
        missing: false,
        markers: candidate.markers.clone(),
        branch: None,
        last_commit_ms: None,
    }
}

fn worktree_artifact(worktree: &GitWorktree, bytes: Option<u64>, truncated: bool, missing: bool) -> RawArtifact {
    let path = Path::new(&worktree.path);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&worktree.path)
        .to_string();
    RawArtifact {
        relative_path: worktree.path.clone(),
        name,
        kind: "worktree".into(),
        bytes,
        modified_ms: if missing { None } else { modified_ms(path) },
        truncated,
        missing,
        markers: Vec::new(),
        branch: worktree.branch.clone(),
        last_commit_ms: None,
    }
}

fn branch_artifact(branch: GitBranch) -> RawArtifact {
    RawArtifact {
        relative_path: branch.name.clone(),
        name: branch.name.clone(),
        kind: "branch".into(),
        bytes: None,
        modified_ms: None,
        truncated: false,
        missing: false,
        markers: Vec::new(),
        branch: Some(branch.name),
        last_commit_ms: branch.commit_unix.map(|seconds| seconds.saturating_mul(1000)),
    }
}

fn display_path(root: &Path, path: &Path) -> String {
    match path.strip_prefix(root) {
        Ok(relative) if !relative.as_os_str().is_empty() => relative.to_string_lossy().to_string(),
        _ => path.to_string_lossy().to_string(),
    }
}

fn modified_ms(path: &Path) -> Option<u64> {
    fs::metadata(path).ok().and_then(|meta| {
        meta.modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok().map(|duration| duration.as_millis() as u64))
    })
}

fn measure(path: &Path, on_tick: &mut dyn FnMut(u64)) -> Result<(u64, bool), String> {
    let mut bytes = 0_u64;
    let mut seen = 0_u64;
    let mut stack = vec![path.to_path_buf()];
    let mut truncated = false;
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(error) => return Err(error.to_string()),
        };
        for entry in entries.flatten() {
            seen += 1;
            if seen % 1024 == 0 {
                on_tick(seen);
            }
            if seen > MAX_ENTRIES {
                truncated = true;
                return Ok((bytes, truncated));
            }
            let child = entry.path();
            let Ok(meta) = fs::symlink_metadata(&child) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                stack.push(child);
            } else {
                bytes = bytes.saturating_add(meta.len());
            }
        }
    }
    Ok((bytes, truncated))
}

#[derive(Default)]
struct RepoLayout {
    worktrees: Vec<GitWorktree>,
    branches: Vec<GitBranch>,
}

fn read_layout(root: &Path) -> Result<RepoLayout, String> {
    let path = root.to_string_lossy().to_string();
    let listed = git(&path, &["worktree", "list", "--porcelain"])?;
    let Some(listed) = listed else {
        return Ok(RepoLayout::default());
    };
    let worktrees = parse_worktree_list(&listed);
    let listed_branches = match git(
        &path,
        &["for-each-ref", "--format=%(refname:short)%09%(committerdate:unix)", "refs/heads"],
    ) {
        Ok(Some(text)) => parse_branches(&text),
        Ok(None) => Vec::new(),
        Err(message) => return Err(message),
    };
    Ok(RepoLayout {
        worktrees,
        branches: listed_branches,
    })
}

fn git(path: &str, args: &[&str]) -> Result<Option<String>, String> {
    let mut full = vec!["-C", path];
    full.extend_from_slice(args);
    match run_command("git", &full, None, Duration::from_secs(8)) {
        Err(CommandError::NotFound(_)) => Err("git was not found, so worktrees and branches were not read.".into()),
        Err(CommandError::Timeout) => Err("git timed out while reading worktrees and branches.".into()),
        Err(CommandError::Io(message)) => Err(redact(&message)),
        Ok(output) if output.success => Ok(Some(output.stdout)),
        Ok(output) => {
            let stderr = output.stderr.to_lowercase();
            if stderr.contains("not a git repository") {
                Ok(None)
            } else {
                Err(redact(&clip(&output.stderr, 240)))
            }
        }
    }
}

fn parse_worktree_list(text: &str) -> Vec<GitWorktree> {
    let mut items = Vec::new();
    let mut current: Option<GitWorktree> = None;
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(item) = current.take() {
                items.push(item);
            }
            current = Some(GitWorktree {
                path: path.trim().to_string(),
                branch: None,
                prunable: false,
            });
        } else if let Some(rest) = line.strip_prefix("branch ") {
            if let Some(item) = current.as_mut() {
                item.branch = Some(rest.trim().trim_start_matches("refs/heads/").to_string());
            }
        } else if line.starts_with("prunable") {
            if let Some(item) = current.as_mut() {
                item.prunable = true;
            }
        }
    }
    if let Some(item) = current {
        items.push(item);
    }
    items
}

fn parse_branches(text: &str) -> Vec<GitBranch> {
    text.lines()
        .filter_map(|line| {
            let (name, date) = line.split_once('\t')?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some(GitBranch {
                name: name.to_string(),
                commit_unix: date.trim().parse().ok(),
            })
        })
        .collect()
}

fn clip(value: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() <= max {
        return trimmed.to_string();
    }
    trimmed.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn scan(path: &Path) -> ArtifactScan {
        scan_project_artifacts(&path.to_string_lossy(), &mut |_| {}).unwrap()
    }

    #[test]
    fn finds_generated_dirs_and_skips_source() {
        let root = std::env::temp_dir().join(format!("dev-doctor-artifacts-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).unwrap();
        fs::create_dir_all(root.join("dist")).unwrap();
        fs::write(root.join("src/index.ts"), "export const n = 1;\n").unwrap();
        fs::write(root.join("dist/app.js"), "console.log(1)\n").unwrap();
        fs::write(root.join("package.json"), "{}\n").unwrap();
        let result = scan(&root);
        assert!(result.artifacts.iter().any(|item| item.name == "dist"));
        assert!(result.artifacts.iter().all(|item| item.name != "src"));
        let dist = result.artifacts.iter().find(|item| item.name == "dist").unwrap();
        assert!(dist.bytes.unwrap() > 0);
        assert!(dist.markers.iter().any(|marker| marker == "package.json"));
        assert_eq!(dist.kind, "directory");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn does_not_follow_a_symlink_directory() {
        let root = std::env::temp_dir().join(format!("dev-doctor-artifacts-link-{}", std::process::id()));
        let outside = std::env::temp_dir().join(format!("dev-doctor-artifacts-out-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(outside.join("dist")).unwrap();
        fs::write(outside.join("dist/secret.txt"), "nope").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("linked")).unwrap();
        let result = scan(&root);
        assert!(result.artifacts.is_empty());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn parses_worktrees_and_branches() {
        let worktrees = parse_worktree_list(
            "worktree /tmp/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /tmp/old\nHEAD def\nbranch refs/heads/old\nprunable gone\n",
        );
        assert_eq!(worktrees.len(), 2);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert!(worktrees[1].prunable);
        assert_eq!(worktrees[1].branch.as_deref(), Some("old"));
        let branches = parse_branches("main\t10\nunused-old\t20\n");
        assert_eq!(branches.len(), 2);
        assert_eq!(branches[1].commit_unix, Some(20));
    }

    #[test]
    fn lists_other_worktrees_and_branches_that_are_not_checked_out() {
        let root = std::env::temp_dir().join(format!("dev-doctor-wt-{}", std::process::id()));
        let other = std::env::temp_dir().join(format!("dev-doctor-wt-other-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&other);
        fs::create_dir_all(&root).unwrap();
        git_ok(&root, &["init", "-b", "main"]);
        fs::write(root.join("README.md"), "sample\n").unwrap();
        git_ok(&root, &["add", "README.md"]);
        git_ok(&root, &["commit", "-m", "init"]);
        git_ok(&root, &["branch", "checked-out"]);
        git_ok(&root, &["branch", "unused-old"]);
        let other_path = other.to_string_lossy().to_string();
        git_ok(&root, &["worktree", "add", &other_path, "checked-out"]);
        fs::create_dir_all(other.join("src")).unwrap();
        fs::create_dir_all(other.join("dist")).unwrap();
        fs::write(other.join("src/keep.js"), "export const n = 1;\n").unwrap();
        fs::write(other.join("dist/app.js"), "console.log(1)\n").unwrap();

        let mut phases = Vec::new();
        let result = scan_project_artifacts(&root.to_string_lossy(), &mut |progress| {
            phases.push(progress.phase);
        })
        .unwrap();

        assert!(phases.iter().any(|phase| phase == "measuring"));
        assert!(result.artifacts.iter().any(|item| item.kind == "worktree" && item.relative_path.contains("dev-doctor-wt-other")));
        assert!(result.artifacts.iter().any(|item| item.kind == "branch" && item.name == "unused-old"));
        assert!(result.artifacts.iter().all(|item| item.name != "checked-out"));
        assert!(result.artifacts.iter().all(|item| item.name != "main"));
        assert!(result.artifacts.iter().any(|item| item.kind == "directory" && item.name == "dist"));
        assert!(result.artifacts.iter().all(|item| item.name != "src"));
        let worktree = result.artifacts.iter().find(|item| item.kind == "worktree").unwrap();
        assert!(worktree.bytes.unwrap() > 0);
        let branch = result.artifacts.iter().find(|item| item.kind == "branch").unwrap();
        assert!(branch.bytes.is_none());

        let _ = fs::remove_dir_all(&other);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn uses_the_shared_catalog_for_python_and_skips_a_bare_bin() {
        let root = std::env::temp_dir().join(format!("dev-doctor-catalog-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("pkg/__pycache__")).unwrap();
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::write(root.join("pkg/app.py"), "print(1)\n").unwrap();
        fs::write(root.join("pkg/__pycache__/app.pyc"), "x").unwrap();
        fs::write(root.join("bin/tool"), "x").unwrap();
        let result = scan(&root);
        assert!(result.artifacts.iter().any(|item| item.name == "__pycache__"));
        assert!(result.artifacts.iter().all(|item| item.name != "bin"));
        let cache = result.artifacts.iter().find(|item| item.name == "__pycache__").unwrap();
        assert!(cache.markers.iter().any(|marker| marker == "*.py"));
        let _ = fs::remove_dir_all(root);
    }

    fn git_ok(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "Dev Doctor")
            .env("GIT_AUTHOR_EMAIL", "dev-doctor@example.com")
            .env("GIT_COMMITTER_NAME", "Dev Doctor")
            .env("GIT_COMMITTER_EMAIL", "dev-doctor@example.com")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    }
}
