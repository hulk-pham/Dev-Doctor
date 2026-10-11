use crate::ai::settings::AiSettings;
use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "com.devdoctor.app.ai";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ApiKeyProvider {
    OpenAi,
    Anthropic,
    Gemini,
    Ollama,
    Groq,
    Together,
    OpenRouter,
    Azure,
}

impl ApiKeyProvider {
    pub fn from_settings_id(id: &str) -> Result<Self, String> {
        match id.trim().to_lowercase().as_str() {
            "openai" => Ok(Self::OpenAi),
            "anthropic" => Ok(Self::Anthropic),
            "gemini" => Ok(Self::Gemini),
            "ollama" => Ok(Self::Ollama),
            "groq" => Ok(Self::Groq),
            "together" => Ok(Self::Together),
            "openrouter" => Ok(Self::OpenRouter),
            "azure" => Ok(Self::Azure),
            other => Err(format!("Unsupported AI provider: {other}")),
        }
    }

    pub fn key_optional(self) -> bool {
        matches!(self, Self::Ollama)
    }

    fn account(&self) -> &'static str {
        match self {
            Self::OpenAi => "openai-api-key",
            Self::Anthropic => "anthropic-api-key",
            Self::Gemini => "gemini-api-key",
            Self::Ollama => "ollama-api-key",
            Self::Groq => "groq-api-key",
            Self::Together => "together-api-key",
            Self::OpenRouter => "openrouter-api-key",
            Self::Azure => "azure-openai-api-key",
        }
    }
}

fn entry(provider: ApiKeyProvider) -> Result<Entry, String> {
    Entry::new(SERVICE, provider.account()).map_err(|error| format!("Keychain entry error: {error}"))
}

pub fn store_api_key(provider: ApiKeyProvider, api_key: &str) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        if provider.key_optional() {
            let _ = delete_api_key(provider);
            return Ok(());
        }
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
    if provider.key_optional() {
        return Ok(true);
    }
    Ok(read_api_key(provider)?.is_some())
}

pub fn api_key_for_request(provider: ApiKeyProvider) -> Result<String, String> {
    if let Some(key) = read_api_key(provider)? {
        return Ok(key);
    }
    if provider.key_optional() {
        return Ok(String::new());
    }
    Err("Add an API key in Settings → AI & Privacy.".into())
}

pub fn is_configured_for_settings(settings: &AiSettings) -> Result<bool, String> {
    if crate::ai::mock::is_dev_mock_provider(&settings.provider) {
        return Ok(true);
    }
    let provider = ApiKeyProvider::from_settings_id(&settings.provider)?;
    has_api_key(provider)
}

pub fn api_key_for_ai_settings(settings: &AiSettings) -> Result<String, String> {
    if crate::ai::mock::is_dev_mock_provider(&settings.provider) {
        return Ok(String::new());
    }
    let provider = ApiKeyProvider::from_settings_id(&settings.provider)?;
    api_key_for_request(provider)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_account_names_are_stable() {
        assert_eq!(ApiKeyProvider::OpenAi.account(), "openai-api-key");
    }

    #[test]
    fn mock_provider_skips_keychain_in_debug() {
        let settings = AiSettings {
            provider: "fake".into(),
            model: "fake-model".into(),
            base_url: None,
        };
        if cfg!(debug_assertions) {
            assert!(is_configured_for_settings(&settings).expect("configured"));
            assert!(api_key_for_ai_settings(&settings).expect("key").is_empty());
        }
    }

    #[test]
    fn keychain_store_read_delete_roundtrip() {
        let provider = ApiKeyProvider::OpenAi;
        let _ = delete_api_key(provider);
        store_api_key(provider, "dev-doctor-test-key").expect("store");
        let read = read_api_key(provider).expect("read result");
        assert!(read.is_some(), "expected key after store, got {read:?}");
        assert!(has_api_key(provider).expect("has"));
        delete_api_key(provider).expect("delete");
    }
}
