use crate::ai::credentials::api_key_for_ai_settings;
use crate::ai::diagnosis::{AiError, AiErrorCode};
use crate::ai::diagnosis::map_provider_err;
use crate::ai::provider::{complete_multi_async, provider_for, MAX_CONTEXT_CHARS};
use crate::ai::settings::AiSettings;
use serde::{Deserialize, Serialize};

const CHAT_SYSTEM: &str = "You are Dev Doctor, a local-first macOS assistant for developers. \
Answer in clear, conversational prose. You can use short bullet lists when helpful. \
You cannot run commands or change the user's machine — suggest safe steps they can take in the app or terminal themselves.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatTurn {
    pub role: String,
    pub content: String,
}

pub fn chat(settings: &AiSettings, turns: &[AiChatTurn]) -> Result<String, AiError> {
    if turns.is_empty() {
        return Err(AiError {
            code: AiErrorCode::ProviderMessage,
            message: "Add a message before sending.".into(),
        });
    }
    let char_count: usize = turns.iter().map(|turn| turn.content.chars().count()).sum();
    if char_count > MAX_CONTEXT_CHARS {
        return Err(AiError {
            code: AiErrorCode::ContextTooLarge,
            message: format!("Conversation is too large (max {MAX_CONTEXT_CHARS} characters). Start a new chat or send a shorter message."),
        });
    }
    let api_key = api_key_for_ai_settings(settings).map_err(|message| AiError {
        code: AiErrorCode::NoKey,
        message,
    })?;
    let provider = provider_for(settings);
    let pairs: Vec<(&str, &str)> = turns
        .iter()
        .map(|turn| (turn.role.as_str(), turn.content.as_str()))
        .collect();
    let reply = provider
        .complete_multi(&settings.model, CHAT_SYSTEM, &pairs, &api_key, false)
        .map_err(map_provider_err)?;
    let trimmed = reply.trim();
    if trimmed.is_empty() {
        return Err(AiError {
            code: AiErrorCode::InvalidSchema,
            message: "Model returned an empty reply.".into(),
        });
    }
    Ok(trimmed.to_string())
}

pub async fn chat_async(settings: &AiSettings, turns: &[AiChatTurn]) -> Result<String, AiError> {
    if turns.is_empty() {
        return Err(AiError {
            code: AiErrorCode::ProviderMessage,
            message: "Add a message before sending.".into(),
        });
    }
    let char_count: usize = turns.iter().map(|turn| turn.content.chars().count()).sum();
    if char_count > MAX_CONTEXT_CHARS {
        return Err(AiError {
            code: AiErrorCode::ContextTooLarge,
            message: format!("Conversation is too large (max {MAX_CONTEXT_CHARS} characters). Start a new chat or send a shorter message."),
        });
    }
    let api_key = api_key_for_ai_settings(settings).map_err(|message| AiError {
        code: AiErrorCode::NoKey,
        message,
    })?;
    let pairs: Vec<(&str, &str)> = turns
        .iter()
        .map(|turn| (turn.role.as_str(), turn.content.as_str()))
        .collect();
    let reply = complete_multi_async(settings, &settings.model, CHAT_SYSTEM, &pairs, &api_key, false)
        .await
        .map_err(map_provider_err)?;
    let trimmed = reply.trim();
    if trimmed.is_empty() {
        return Err(AiError {
            code: AiErrorCode::InvalidSchema,
            message: "Model returned an empty reply.".into(),
        });
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::{FakeProvider, LlmProvider};

    #[test]
    fn fake_chat_returns_text() {
        let settings = AiSettings {
            provider: "fake".into(),
            model: "fake-model".into(),
            base_url: None,
        };
        let provider = FakeProvider {
            response: "Hello from fake.".into(),
        };
        let turns = vec![AiChatTurn {
            role: "user".into(),
            content: "Hi".into(),
        }];
        let pairs: Vec<(&str, &str)> = turns.iter().map(|t| (t.role.as_str(), t.content.as_str())).collect();
        let reply = provider
            .complete_multi(&settings.model, CHAT_SYSTEM, &pairs, "key", false)
            .expect("chat");
        assert!(reply.contains("fake"));
    }
}
