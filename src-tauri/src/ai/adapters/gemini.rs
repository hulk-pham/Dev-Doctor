use crate::ai::provider::ProviderError;
use crate::security::ensure_allowed_ai_host;
use serde::Deserialize;
use std::time::Duration;

const GEMINI_HOST: &str = "https://generativelanguage.googleapis.com";

pub struct GeminiAdapter;

impl GeminiAdapter {
    pub fn complete_multi(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError> {
        if api_key.is_empty() {
            return Err(ProviderError::Unauthorized);
        }
        let url = format!("{GEMINI_HOST}/v1beta/models/{model}:generateContent");
        ensure_allowed_ai_host(&url).map_err(ProviderError::Network)?;
        let mut contents = Vec::new();
        for (role, content) in turns {
            let gemini_role = if *role == "assistant" { "model" } else { "user" };
            contents.push(serde_json::json!({
                "role": gemini_role,
                "parts": [{ "text": content }]
            }));
        }
        let mut generation_config = serde_json::json!({ "temperature": 0.2 });
        if json_object {
            generation_config["responseMimeType"] = serde_json::json!("application/json");
        }
        let body = serde_json::json!({
            "systemInstruction": { "parts": [{ "text": system }] },
            "contents": contents,
            "generationConfig": generation_config,
        });
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(45)).build();
        let response = agent
            .post(&url)
            .set("x-goog-api-key", api_key)
            .set("Content-Type", "application/json")
            .send_json(body);
        match response {
            Ok(response) => {
                let status = response.status();
                if status == 401 || status == 403 {
                    return Err(ProviderError::Unauthorized);
                }
                if status == 429 {
                    return Err(ProviderError::RateLimit);
                }
                if !(200..300).contains(&status) {
                    return Err(ProviderError::Http(status, response.into_string().unwrap_or_default()));
                }
                let body = response.into_string().map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
                decode_gemini_generate_json(&body)
            }
            Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
                Err(ProviderError::Unauthorized)
            }
            Err(ureq::Error::Status(429, _)) => Err(ProviderError::RateLimit),
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

    pub async fn complete_multi_async(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError> {
        if api_key.is_empty() {
            return Err(ProviderError::Unauthorized);
        }
        let url = format!("{GEMINI_HOST}/v1beta/models/{model}:generateContent");
        ensure_allowed_ai_host(&url).map_err(ProviderError::Network)?;
        let mut contents = Vec::new();
        for (role, content) in turns {
            let gemini_role = if *role == "assistant" { "model" } else { "user" };
            contents.push(serde_json::json!({
                "role": gemini_role,
                "parts": [{ "text": content }]
            }));
        }
        let mut generation_config = serde_json::json!({ "temperature": 0.2 });
        if json_object {
            generation_config["responseMimeType"] = serde_json::json!("application/json");
        }
        let body = serde_json::json!({
            "systemInstruction": { "parts": [{ "text": system }] },
            "contents": contents,
            "generationConfig": generation_config,
        });
        let response = crate::ai::http::client()
            .post(&url)
            .header("x-goog-api-key", api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    ProviderError::Timeout
                } else {
                    ProviderError::Network(error.to_string())
                }
            })?;
        let status = response.status().as_u16();
        let text = response
            .text()
            .await
            .map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
        if status == 401 || status == 403 {
            return Err(ProviderError::Unauthorized);
        }
        if status == 429 {
            return Err(ProviderError::RateLimit);
        }
        if !(200..300).contains(&status) {
            return Err(ProviderError::Http(status, text));
        }
        decode_gemini_generate_json(&text)
    }
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}

#[derive(Debug, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

pub(crate) fn decode_gemini_generate_json(json: &str) -> Result<String, ProviderError> {
    let parsed: GeminiResponse =
        serde_json::from_str(json).map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
    parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts.into_iter().next())
        .and_then(|p| p.text)
        .ok_or_else(|| ProviderError::InvalidResponse("Missing assistant content.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_gemini_generate_json_reads_candidate_text() {
        let json = r#"{"candidates":[{"content":{"parts":[{"text":"Gemini says hi"}]}}]}"#;
        assert_eq!(decode_gemini_generate_json(json).expect("parse"), "Gemini says hi");
    }
}
