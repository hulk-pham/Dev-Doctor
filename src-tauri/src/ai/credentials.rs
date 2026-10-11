use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "com.devdoctor.app.ai";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ApiKeyProvider {
    OpenAi,
}

impl ApiKeyProvider {
    pub fn from_settings_id(id: &str) -> Result<Self, String> {
        match id.trim().to_lowercase().as_str() {
            "openai" => Ok(Self::OpenAi),
            other => Err(format!("Unsupported AI provider: {other}")),
        }
    }

    fn account(&self) -> &'static str {
        match self {
            Self::OpenAi => "openai-api-key",
        }
    }
}

fn entry(provider: ApiKeyProvider) -> Result<Entry, String> {
    Entry::new(SERVICE, provider.account()).map_err(|error| format!("Keychain entry error: {error}"))
}

pub fn store_api_key(provider: ApiKeyProvider, api_key: &str) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("API key is empty.".into());
    }
    if trimmed.len() > 512 {
        return Err("API key looks too long.".into());
    }
    entry(provider)?
        .set_password(trimmed)
        .map_err(|error| format!("Could not store the API key in Keychain: {error}"))
}

pub fn delete_api_key(provider: ApiKeyProvider) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Could not delete the API key: {error}")),
    }
}

pub fn read_api_key(provider: ApiKeyProvider) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Could not read the API key: {error}")),
    }
}

pub fn has_api_key(provider: ApiKeyProvider) -> Result<bool, String> {
    Ok(read_api_key(provider)?.is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_account_names_are_stable() {
        assert_eq!(ApiKeyProvider::OpenAi.account(), "openai-api-key");
    }
}
