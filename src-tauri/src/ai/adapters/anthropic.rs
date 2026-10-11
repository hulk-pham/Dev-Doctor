use crate::ai::provider::ProviderError;
use crate::security::ensure_allowed_ai_host;
use serde::Deserialize;
use std::time::Duration;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

pub struct AnthropicAdapter;

impl AnthropicAdapter {
    pub fn complete_multi(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        _json_object: bool,
    ) -> Result<String, ProviderError> {
        ensure_allowed_ai_host(ANTHROPIC_URL).map_err(ProviderError::Network)?;
        if api_key.is_empty() {
            return Err(ProviderError::Unauthorized);
        }
        let mut messages = Vec::new();
        for (role, content) in turns {
            let role = if *role == "assistant" { "assistant" } else { "user" };
            messages.push(serde_json::json!({ "role": role, "content": content }));
        }
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": messages,
            "temperature": 0.2,
        });
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(45)).build();
        let response = agent
            .post(ANTHROPIC_URL)
            .set("x-api-key", api_key)
            .set("anthropic-version", ANTHROPIC_VERSION)
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
                if !(200..300).contains(&status) {
                    return Err(ProviderError::Http(status, response.into_string().unwrap_or_default()));
                }
                let body = response.into_string().map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
                decode_anthropic_messages_json(&body)
            }
            Err(ureq::Error::Status(401, _)) => Err(ProviderError::Unauthorized),
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
        _json_object: bool,
    ) -> Result<String, ProviderError> {
        ensure_allowed_ai_host(ANTHROPIC_URL).map_err(ProviderError::Network)?;
        if api_key.is_empty() {
            return Err(ProviderError::Unauthorized);
        }
        let mut messages = Vec::new();
        for (role, content) in turns {
            let role = if *role == "assistant" { "assistant" } else { "user" };
            messages.push(serde_json::json!({ "role": role, "content": content }));
        }
        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system,
            "messages": messages,
            "temperature": 0.2,
        });
        let response = crate::ai::http::client()
            .post(ANTHROPIC_URL)
            .header("x-api-key", api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
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
        if status == 401 {
            return Err(ProviderError::Unauthorized);
        }
        if status == 429 {
            return Err(ProviderError::RateLimit);
        }
        if !(200..300).contains(&status) {
            return Err(ProviderError::Http(status, text));
        }
        decode_anthropic_messages_json(&text)
    }
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicBlock>,
}

#[derive(Debug, Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

pub(crate) fn decode_anthropic_messages_json(json: &str) -> Result<String, ProviderError> {
    let parsed: AnthropicResponse =
        serde_json::from_str(json).map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
    parsed
        .content
        .iter()
        .find_map(|block| {
            if block.block_type == "text" {
                block.text.clone()
            } else {
                None
            }
        })
        .ok_or_else(|| ProviderError::InvalidResponse("Missing assistant content.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_anthropic_messages_json_reads_text_block() {
        let json = r#"{"content":[{"type":"text","text":"Hello from Claude."}]}"#;
        assert_eq!(decode_anthropic_messages_json(json).expect("parse"), "Hello from Claude.");
    }
}
