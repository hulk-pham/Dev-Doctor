use crate::security::{ensure_allowed_url, redact};
use serde::Serialize;
use std::time::Duration;

const RELEASES_URL: &str = "https://api.github.com/repos/hulk-pham/Dev-Doctor/releases/latest";
const RELEASES_PAGE: &str = "https://github.com/hulk-pham/Dev-Doctor/releases";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub status: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub url: Option<String>,
    pub notes: Option<String>,
    pub message: String,
}

#[derive(Debug, serde::Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}

pub fn check_for_update() -> UpdateCheck {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(8)).build();
    let response = agent
        .get(RELEASES_URL)
        .set("User-Agent", "Dev-Doctor")
        .set("Accept", "application/vnd.github+json")
        .call();
    match response {
        Ok(response) => match response.into_json::<GithubRelease>() {
            Ok(release) => interpret(&current, release),
            Err(_) => unavailable(&current, "GitHub returned a release Dev Doctor could not read.".into()),
        },
        Err(ureq::Error::Status(404, _)) => UpdateCheck {
            status: "none".into(),
            current_version: current.clone(),
            latest_version: None,
            url: None,
            notes: None,
            message: format!("No release has been published yet. You are on {current}."),
        },
        Err(ureq::Error::Status(code, _)) => {
            unavailable(&current, format!("GitHub returned status {code}."))
        }
        Err(error) => unavailable(&current, format!("Could not reach GitHub. {error}")),
    }
}

fn interpret(current: &str, release: GithubRelease) -> UpdateCheck {
    let Some(latest) = stable_version(&release.tag_name) else {
        return unavailable(
            current,
            format!("The latest release tag ({}) is not a stable version.", release.tag_name),
        );
    };
    let Some(current_parts) = stable_version(current) else {
        return unavailable(current, "The installed version could not be compared.".into());
    };
    if latest <= current_parts {
        return UpdateCheck {
            status: "current".into(),
            current_version: current.to_string(),
            latest_version: Some(format_version(latest)),
            url: None,
            notes: None,
            message: format!("Dev Doctor {current} is the latest release."),
        };
    }
    let latest_label = format_version(latest);
    let url = release_url(&release.html_url);
    let notes = release.body.and_then(|body| clip_notes(&redact(&body)));
    UpdateCheck {
        status: "available".into(),
        current_version: current.to_string(),
        latest_version: Some(latest_label.clone()),
        url,
        notes,
        message: format!("Dev Doctor {latest_label} is available. You are on {current}."),
    }
}

fn release_url(html_url: &str) -> Option<String> {
    if ensure_allowed_url(html_url).is_ok() {
        Some(html_url.to_string())
    } else if ensure_allowed_url(RELEASES_PAGE).is_ok() {
        Some(RELEASES_PAGE.to_string())
    } else {
        None
    }
}

fn unavailable(current: &str, message: String) -> UpdateCheck {
    UpdateCheck {
        status: "unavailable".into(),
        current_version: current.to_string(),
        latest_version: None,
        url: None,
        notes: None,
        message,
    }
}

fn clip_notes(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut chars = trimmed.chars();
    let clipped: String = chars.by_ref().take(480).collect();
    if chars.next().is_some() {
        Some(format!("{clipped}…"))
    } else {
        Some(clipped)
    }
}

fn stable_version(input: &str) -> Option<(u64, u64, u64)> {
    let trimmed = input.trim().trim_start_matches('v');
    if trimmed.contains('-') || trimmed.contains('+') {
        return None;
    }
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn format_version(version: (u64, u64, u64)) -> String {
    format!("{}.{}.{}", version.0, version.1, version.2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_versions_compare_without_a_network() {
        assert!(stable_version("v0.3.0") > stable_version("0.2.0"));
        assert_eq!(stable_version("v0.2.0"), stable_version("0.2.0"));
        assert!(stable_version("0.2.1") > stable_version("0.2.0"));
        assert!(stable_version("0.3.0-beta.1").is_none());
        assert!(stable_version("nightly").is_none());
    }

    #[test]
    fn an_older_tag_is_not_an_update() {
        let check = interpret(
            "0.2.0",
            GithubRelease {
                tag_name: "v0.1.0".into(),
                html_url: "https://github.com/hulk-pham/Dev-Doctor/releases/tag/v0.1.0".into(),
                body: None,
            },
        );
        assert_eq!(check.status, "current");
    }

    #[test]
    fn a_newer_tag_keeps_the_release_page() {
        let check = interpret(
            "0.2.0",
            GithubRelease {
                tag_name: "v0.3.0".into(),
                html_url: "https://github.com/hulk-pham/Dev-Doctor/releases/tag/v0.3.0".into(),
                body: Some("Fixes the scan.".into()),
            },
        );
        assert_eq!(check.status, "available");
        assert_eq!(check.latest_version.as_deref(), Some("0.3.0"));
        assert_eq!(
            check.url.as_deref(),
            Some("https://github.com/hulk-pham/Dev-Doctor/releases/tag/v0.3.0")
        );
    }
}
