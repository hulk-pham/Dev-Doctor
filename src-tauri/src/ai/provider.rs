use crate::ai::settings::AiSettings;
use serde::Deserialize;
use std::time::Duration;

pub const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
pub const MAX_CONTEXT_CHARS: usize = 48_000;

pub trait LlmProvider: Send + Sync {
    fn complete(&self, model: &str, system: &str, user: &str, api_key: &str) -> Result<String, ProviderError>;
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

pub struct OpenAiProvider;

impl LlmProvider for OpenAiProvider {
    fn complete(&self, model: &str, system: &str, user: &str, api_key: &str) -> Result<String, ProviderError> {
        crate::security::ensure_allowed_ai_host(OPENAI_CHAT_URL)
            .map_err(|message| ProviderError::Network(message))?;
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(60)).build();
        let body = serde_json::json!({
            "model": model,
            "temperature": 0.2,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ]
        });
        let response = agent
            .post(OPENAI_CHAT_URL)
            .set("Authorization", &format!("Bearer {api_key}"))
            .set("Content-Type", "application/json")
            .send_json(body);
        match response {
            Ok(response) => {
                let status = response.status();
                if status == 401 {
                    return Err(ProviderError::Unauthorized);
                }
                if status == 429 {
                    return Err(ProviderError::RateLimit);
                }
                if status == 404 {
                    return Err(ProviderError::UnsupportedModel(model.to_string()));
                }
                if !(200..300).contains(&status) {
                    let text = response.into_string().unwrap_or_default();
                    return Err(ProviderError::Http(status, text));
                }
                let parsed: OpenAiChatResponse = response
                    .into_json()
                    .map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
                parsed
                    .choices
                    .first()
                    .and_then(|choice| choice.message.content.clone())
                    .ok_or_else(|| ProviderError::InvalidResponse("Missing assistant content.".into()))
            }
            Err(ureq::Error::Status(401, _)) => Err(ProviderError::Unauthorized),
            Err(ureq::Error::Status(429, _)) => Err(ProviderError::RateLimit),
            Err(ureq::Error::Status(404, _)) => Err(ProviderError::UnsupportedModel(model.to_string())),
            Err(ureq::Error::Status(code, response)) => {
                Err(ProviderError::Http(code, response.into_string().unwrap_or_default()))
            }
            Err(error) => {
                let message = error.to_string();
                if message.to_lowercase().contains("timeout") {
                    Err(ProviderError::Timeout)
                } else {
                    Err(ProviderError::Network(message))
                }
            }
        }
    }
}

#[derive(Debug, Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAiMessage {
    content: Option<String>,
}

pub struct FakeProvider {
    pub response: String,
}

impl LlmProvider for FakeProvider {
    fn complete(&self, _model: &str, _system: &str, _user: &str, _api_key: &str) -> Result<String, ProviderError> {
        Ok(self.response.clone())
    }
}

pub fn provider_for(settings: &AiSettings) -> Box<dyn LlmProvider> {
    if settings.provider == "fake" {
        return Box::new(FakeProvider {
            response: fake_diagnosis_json(),
        });
    }
    Box::new(OpenAiProvider)
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
