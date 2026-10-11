use crate::ai::adapters::{
    azure_chat_url, post_openai_chat_async, AnthropicAdapter, AuthStyle, GeminiAdapter, OpenAiCompatAdapter,
    GROQ_CHAT_URL, OLLAMA_DEFAULT_URL, OPENROUTER_CHAT_URL, TOGETHER_CHAT_URL,
};
use crate::ai::settings::AiSettings;

pub use crate::ai::adapters::OPENAI_CHAT_URL;
pub const MAX_CONTEXT_CHARS: usize = 48_000;

pub trait LlmProvider: Send + Sync {
    fn complete(&self, model: &str, system: &str, user: &str, api_key: &str) -> Result<String, ProviderError> {
        self.complete_multi(model, system, &[("user", user)], api_key, true)
    }

    fn complete_multi(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProviderError {
    Network(String),
    Timeout,
    RateLimit,
    Unauthorized,
    UnsupportedModel(String),
    InvalidResponse(String),
    Http(u16, String),
}

struct RoutedProvider {
    settings: AiSettings,
}

impl LlmProvider for RoutedProvider {
    fn complete_multi(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError> {
        match self.settings.provider.as_str() {
            "anthropic" => AnthropicAdapter.complete_multi(model, system, turns, api_key, json_object),
            "gemini" => GeminiAdapter.complete_multi(model, system, turns, api_key, json_object),
            "azure" => {
                let base = self
                    .settings
                    .base_url
                    .as_deref()
                    .ok_or_else(|| ProviderError::Network("Azure OpenAI needs a resource endpoint.".into()))?;
                let url = azure_chat_url(base, model).map_err(ProviderError::Network)?;
                OpenAiCompatAdapter {
                    url,
                    auth: AuthStyle::AzureApiKey,
                }
                .complete_multi(model, system, turns, api_key, json_object)
            }
            "ollama" => {
                let url = self
                    .settings
                    .base_url
                    .clone()
                    .unwrap_or_else(|| OLLAMA_DEFAULT_URL.into());
                crate::security::validate_ollama_endpoint(&url)
                    .map_err(|message| ProviderError::Network(message))?;
                OpenAiCompatAdapter {
                    url,
                    auth: AuthStyle::Bearer,
                }
                .complete_multi(model, system, turns, api_key, json_object)
            }
            "groq" => OpenAiCompatAdapter {
                url: GROQ_CHAT_URL.into(),
                auth: AuthStyle::Bearer,
            }
            .complete_multi(model, system, turns, api_key, json_object),
            "together" => OpenAiCompatAdapter {
                url: TOGETHER_CHAT_URL.into(),
                auth: AuthStyle::Bearer,
            }
            .complete_multi(model, system, turns, api_key, json_object),
            "openrouter" => OpenAiCompatAdapter {
                url: OPENROUTER_CHAT_URL.into(),
                auth: AuthStyle::Bearer,
            }
            .complete_multi(model, system, turns, api_key, json_object),
            _ => OpenAiCompatAdapter {
                url: OPENAI_CHAT_URL.into(),
                auth: AuthStyle::Bearer,
            }
            .complete_multi(model, system, turns, api_key, json_object),
        }
    }
}

pub struct FakeProvider {
    pub response: String,
}

impl LlmProvider for FakeProvider {
    fn complete_multi(
        &self,
        _model: &str,
        _system: &str,
        _turns: &[(&str, &str)],
        _api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError> {
        if json_object {
            Ok(self.response.clone())
        } else {
            Ok("Here is a conversational follow-up from the fake provider.".into())
        }
    }
}

pub async fn complete_multi_async(
    settings: &AiSettings,
    model: &str,
    system: &str,
    turns: &[(&str, &str)],
    api_key: &str,
    json_object: bool,
) -> Result<String, ProviderError> {
    if settings.provider == "fake" {
        return FakeProvider {
            response: fake_diagnosis_json(),
        }
        .complete_multi(model, system, turns, api_key, json_object);
    }
    match settings.provider.as_str() {
        "anthropic" => {
            AnthropicAdapter.complete_multi_async(model, system, turns, api_key, json_object).await
        }
        "gemini" => GeminiAdapter.complete_multi_async(model, system, turns, api_key, json_object).await,
        "azure" => {
            let base = settings
                .base_url
                .as_deref()
                .ok_or_else(|| ProviderError::Network("Azure OpenAI needs a resource endpoint.".into()))?;
            let url = azure_chat_url(base, model).map_err(ProviderError::Network)?;
            post_openai_chat_async(&url, model, system, turns, api_key, json_object, AuthStyle::AzureApiKey).await
        }
        "ollama" => {
            let url = settings
                .base_url
                .clone()
                .unwrap_or_else(|| OLLAMA_DEFAULT_URL.into());
            crate::security::validate_ollama_endpoint(&url)
                .map_err(ProviderError::Network)?;
            post_openai_chat_async(&url, model, system, turns, api_key, json_object, AuthStyle::Bearer).await
        }
        "groq" => {
            post_openai_chat_async(
                GROQ_CHAT_URL,
                model,
                system,
                turns,
                api_key,
                json_object,
                AuthStyle::Bearer,
            )
            .await
        }
        "together" => {
            post_openai_chat_async(
                TOGETHER_CHAT_URL,
                model,
                system,
                turns,
                api_key,
                json_object,
                AuthStyle::Bearer,
            )
            .await
        }
        "openrouter" => {
            post_openai_chat_async(
                OPENROUTER_CHAT_URL,
                model,
                system,
                turns,
                api_key,
                json_object,
                AuthStyle::Bearer,
            )
            .await
        }
        _ => {
            post_openai_chat_async(
                OPENAI_CHAT_URL,
                model,
                system,
                turns,
                api_key,
                json_object,
                AuthStyle::Bearer,
            )
            .await
        }
    }
}

pub fn provider_for(settings: &AiSettings) -> Box<dyn LlmProvider> {
    if settings.provider == "fake" {
        return Box::new(FakeProvider {
            response: fake_diagnosis_json(),
        });
    }
    Box::new(RoutedProvider {
        settings: settings.clone(),
    })
}

pub(crate) fn fake_diagnosis_json() -> String {
    serde_json::json!({
        "summary": "Test diagnosis from the fake provider.",
        "evidence": ["CPU samples were elevated."],
        "possibleCauses": ["A dev server may be busy."],
        "confidence": "medium",
        "recommendedSteps": [{ "step": "Check Processes for high CPU rows.", "risk": "read" }],
        "verification": "Re-run sampling and confirm CPU drops after stopping the heavy process."
    })
    .to_string()
}
