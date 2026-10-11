use crate::ai::credentials::api_key_for_ai_settings;
use crate::ai::provider::{complete_multi_async, provider_for, ProviderError, LlmProvider, MAX_CONTEXT_CHARS};
use crate::ai::settings::AiSettings;
use serde::{Deserialize, Serialize};

const SYSTEM_PROMPT: &str = "You are Dev Doctor, a local-first macOS assistant for developers. \
Respond with a single JSON object only, no markdown, matching this shape: \
{\"summary\":string,\"evidence\":string[],\"possibleCauses\":string[],\"confidence\":\"low\"|\"medium\"|\"high\",\
\"recommendedSteps\":[{\"step\":string,\"risk\":\"read\"|\"confirm\"|\"danger\"}],\"verification\":string}. \
Do not instruct the user to run shell commands unless risk is confirm or danger. Never claim you changed the system.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AiErrorCode {
    NoKey,
    Network,
    Timeout,
    RateLimit,
    UnsupportedModel,
    InvalidSchema,
    ContextTooLarge,
    UnsupportedProvider,
    ProviderMessage,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiError {
    pub code: AiErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRecommendedStep {
    pub step: String,
    pub risk: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDiagnosisResponse {
    pub summary: String,
    pub evidence: Vec<String>,
    pub possible_causes: Vec<String>,
    pub confidence: String,
    pub recommended_steps: Vec<AiRecommendedStep>,
    pub verification: String,
}

pub fn test_connection(settings: &AiSettings) -> Result<(), AiError> {
    let api_key = api_key_for_ai_settings(settings).map_err(|message| AiError {
        code: AiErrorCode::NoKey,
        message,
    })?;
    let provider = provider_for(settings);
    let reply = provider
        .complete(
            &settings.model,
            "Reply with the JSON object {\"summary\":\"ok\",\"evidence\":[],\"possibleCauses\":[],\"confidence\":\"high\",\"recommendedSteps\":[],\"verification\":\"Connection ok.\"}",
            "Connection test.",
            &api_key,
        )
        .map_err(map_provider_err)?;
    validate_diagnosis_json(&reply).map_err(map_schema_err)?;
    Ok(())
}

pub async fn diagnose_async(settings: &AiSettings, context_text: &str) -> Result<AiDiagnosisResponse, AiError> {
    if context_text.chars().count() > MAX_CONTEXT_CHARS {
        return Err(AiError {
            code: AiErrorCode::ContextTooLarge,
            message: format!("Context is too large (max {MAX_CONTEXT_CHARS} characters). Remove items and try again."),
        });
    }
    let api_key = api_key_for_ai_settings(settings).map_err(|message| AiError {
        code: AiErrorCode::NoKey,
        message,
    })?;
    let reply = complete_multi_async(
        settings,
        &settings.model,
        SYSTEM_PROMPT,
        &[("user", context_text)],
        &api_key,
        true,
    )
    .await
    .map_err(map_provider_err)?;
    match parse_diagnosis(&reply) {
        Ok(parsed) => Ok(parsed),
        Err(first_err) => {
            let retry_prompt = format!(
                "{context_text}\n\nYour previous reply was not valid JSON. Reply with a single JSON object only, no markdown."
            );
            let retry = complete_multi_async(
                settings,
                &settings.model,
                SYSTEM_PROMPT,
                &[("user", &retry_prompt)],
                &api_key,
                true,
            )
            .await
            .map_err(map_provider_err)?;
            parse_diagnosis(&retry).map_err(|_| map_schema_err(first_err))
        }
    }
}

pub fn diagnose(settings: &AiSettings, context_text: &str) -> Result<AiDiagnosisResponse, AiError> {
    if context_text.chars().count() > MAX_CONTEXT_CHARS {
        return Err(AiError {
            code: AiErrorCode::ContextTooLarge,
            message: format!("Context is too large (max {MAX_CONTEXT_CHARS} characters). Remove items and try again."),
        });
    }
    let api_key = api_key_for_ai_settings(settings).map_err(|message| AiError {
        code: AiErrorCode::NoKey,
        message,
    })?;
    let provider = provider_for(settings);
    let reply = provider
        .complete(&settings.model, SYSTEM_PROMPT, context_text, &api_key)
        .map_err(map_provider_err)?;
    match parse_diagnosis(&reply) {
        Ok(parsed) => Ok(parsed),
        Err(first_err) => {
            let retry_prompt = format!(
                "{context_text}\n\nYour previous reply was not valid JSON. Reply with a single JSON object only, no markdown."
            );
            let retry = provider
                .complete(&settings.model, SYSTEM_PROMPT, &retry_prompt, &api_key)
                .map_err(map_provider_err)?;
            parse_diagnosis(&retry).map_err(|_| map_schema_err(first_err))
        }
    }
}

pub fn diagnose_with_provider(
    settings: &AiSettings,
    context_text: &str,
    provider: &dyn LlmProvider,
    api_key: &str,
) -> Result<AiDiagnosisResponse, AiError> {
    let reply = provider
        .complete(&settings.model, SYSTEM_PROMPT, context_text, api_key)
        .map_err(map_provider_err)?;
    parse_diagnosis(&reply).map_err(map_schema_err)
}

fn parse_diagnosis(raw: &str) -> Result<AiDiagnosisResponse, String> {
    let trimmed = raw.trim();
    let json_text = trimmed
        .strip_prefix("```json")
        .and_then(|rest| rest.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(trimmed);
    validate_diagnosis_json(json_text)
}

fn validate_diagnosis_json(json_text: &str) -> Result<AiDiagnosisResponse, String> {
    let value: AiDiagnosisResponse =
        serde_json::from_str(json_text).map_err(|error| format!("Model output was not valid JSON: {error}"))?;
    if value.summary.trim().is_empty() {
        return Err("Model output missing summary.".into());
    }
    if !matches!(value.confidence.as_str(), "low" | "medium" | "high") {
        return Err("Model output confidence must be low, medium, or high.".into());
    }
    for step in &value.recommended_steps {
        if step.step.trim().is_empty() {
            return Err("Model output included an empty recommended step.".into());
        }
        if !matches!(step.risk.as_str(), "read" | "confirm" | "danger") {
            return Err("Model output step risk must be read, confirm, or danger.".into());
        }
    }
    Ok(value)
}

pub(crate) fn map_provider_err(error: ProviderError) -> AiError {
    match error {
        ProviderError::Unauthorized => AiError {
            code: AiErrorCode::NoKey,
            message: "The API key was rejected. Check Settings → AI & Privacy.".into(),
        },
        ProviderError::Timeout => AiError {
            code: AiErrorCode::Timeout,
            message: "The AI provider timed out. Try again with a smaller context.".into(),
        },
        ProviderError::RateLimit => AiError {
            code: AiErrorCode::RateLimit,
            message: "The AI provider rate-limited this key. Wait and try again.".into(),
        },
        ProviderError::UnsupportedModel(model) => AiError {
            code: AiErrorCode::UnsupportedModel,
            message: format!("Model \"{model}\" is not available for this key."),
        },
        ProviderError::Network(message) => AiError {
            code: AiErrorCode::Network,
            message: format!("Network error while contacting the AI provider: {message}"),
        },
        ProviderError::InvalidResponse(message) | ProviderError::Http(_, message) => AiError {
            code: AiErrorCode::ProviderMessage,
            message,
        },
    }
}

fn map_schema_err(message: String) -> AiError {
    AiError {
        code: AiErrorCode::InvalidSchema,
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::provider::FakeProvider;

    #[test]
    fn fake_provider_diagnosis_parses() {
        let settings = AiSettings {
            provider: "fake".into(),
            model: "fake-model".into(),
            base_url: None,
        };
        let provider = FakeProvider {
            response: crate::ai::provider::fake_diagnosis_json(),
        };
        let result = diagnose_with_provider(&settings, "Alert: high CPU", &provider, "test-key").expect("diagnose");
        assert!(result.summary.contains("Test diagnosis"));
        assert_eq!(result.confidence, "medium");
    }

    #[test]
    fn rejects_invalid_schema() {
        let err = parse_diagnosis(r#"{"summary":"","evidence":[],"possibleCauses":[],"confidence":"high","recommendedSteps":[],"verification":""}"#)
            .expect_err("empty summary");
        assert!(err.contains("summary"));
    }

    #[test]
    fn openai_host_is_allowlisted() {
        assert!(crate::security::ensure_allowed_ai_host(crate::ai::provider::OPENAI_CHAT_URL).is_ok());
    }
}
