use crate::ai::provider::ProviderError;
use crate::security::ensure_allowed_ai_host;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Clone, Copy)]
pub enum AuthStyle {
    Bearer,
    AzureApiKey,
}

pub struct OpenAiCompatAdapter {
    pub url: String,
    pub auth: AuthStyle,
}

impl OpenAiCompatAdapter {
    pub fn complete_multi(
        &self,
        model: &str,
        system: &str,
        turns: &[(&str, &str)],
        api_key: &str,
        json_object: bool,
    ) -> Result<String, ProviderError> {
        post_openai_chat(&self.url, model, system, turns, api_key, json_object, self.auth)
    }
}

pub fn post_openai_chat(
    url: &str,
    model: &str,
    system: &str,
    turns: &[(&str, &str)],
    api_key: &str,
    json_object: bool,
    auth: AuthStyle,
) -> Result<String, ProviderError> {
    ensure_allowed_ai_host(url).map_err(ProviderError::Network)?;
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(45)).build();
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    for (role, content) in turns {
        messages.push(serde_json::json!({ "role": role, "content": content }));
    }
    let mut body = serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "messages": messages
    });
    if json_object {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    let mut request = agent.post(url).set("Content-Type", "application/json");
    match auth {
        AuthStyle::Bearer if !api_key.is_empty() => {
            request = request.set("Authorization", &format!("Bearer {api_key}"));
        }
        AuthStyle::Bearer => {}
        AuthStyle::AzureApiKey => {
            request = request.set("api-key", api_key);
        }
    }
    let response = request.send_json(body);
    map_openai_response(response, model)
}

pub async fn post_openai_chat_async(
    url: &str,
    model: &str,
    system: &str,
    turns: &[(&str, &str)],
    api_key: &str,
    json_object: bool,
    auth: AuthStyle,
) -> Result<String, ProviderError> {
    ensure_allowed_ai_host(url).map_err(ProviderError::Network)?;
    let mut messages = vec![serde_json::json!({ "role": "system", "content": system })];
    for (role, content) in turns {
        messages.push(serde_json::json!({ "role": role, "content": content }));
    }
    let mut body = serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "messages": messages
    });
    if json_object {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    let client = crate::ai::http::client();
    let mut request = client.post(url).header("Content-Type", "application/json");
    match auth {
        AuthStyle::Bearer if !api_key.is_empty() => {
            request = request.header("Authorization", format!("Bearer {api_key}"));
        }
        AuthStyle::Bearer => {}
        AuthStyle::AzureApiKey => {
            request = request.header("api-key", api_key);
        }
    }
    let response = request.json(&body).send().await.map_err(map_reqwest_err)?;
    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
    map_openai_http_status(status, &text, model)
}

fn map_reqwest_err(error: reqwest::Error) -> ProviderError {
    if error.is_timeout() {
        return ProviderError::Timeout;
    }
    ProviderError::Network(error.to_string())
}

fn map_openai_http_status(status: u16, body: &str, model: &str) -> Result<String, ProviderError> {
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
        return Err(ProviderError::Http(status, body.to_string()));
    }
    decode_openai_chat_json(body)
}

pub fn azure_chat_url(base_url: &str, deployment: &str) -> Result<String, String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Azure OpenAI needs a resource endpoint in settings.".into());
    }
    crate::security::validate_azure_resource_endpoint(trimmed)?;
    Ok(format!(
        "{trimmed}/openai/deployments/{deployment}/chat/completions?api-version={}",
        crate::ai::adapters::AZURE_API_VERSION
    ))
}

fn map_openai_response(
    response: Result<ureq::Response, ureq::Error>,
    model: &str,
) -> Result<String, ProviderError> {
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
            let body = response.into_string().map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
            decode_openai_chat_json(&body)
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

pub(crate) fn decode_openai_chat_json(json: &str) -> Result<String, ProviderError> {
    let parsed: OpenAiChatResponse =
        serde_json::from_str(json).map_err(|error| ProviderError::InvalidResponse(error.to_string()))?;
    parsed
        .choices
        .first()
        .and_then(|choice| choice.message.content.clone())
        .ok_or_else(|| ProviderError::InvalidResponse("Missing assistant content.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::Method::POST;
    use httpmock::MockServer;

    #[test]
    fn decode_openai_chat_json_extracts_assistant_text() {
        let json = r#"{"choices":[{"message":{"content":"{\"summary\":\"ok\"}"}}]}"#;
        assert_eq!(decode_openai_chat_json(json).expect("parse"), "{\"summary\":\"ok\"}");
    }

    #[test]
    fn post_openai_chat_hits_local_mock_server() {
        let server = MockServer::start();
        let mock = server.mock(|when, then| {
            when.method(POST).path("/v1/chat/completions");
            then.status(200).json_body(serde_json::json!({
                "choices": [{ "message": { "content": "mock reply" } }]
            }));
        });
        let url = format!("{}/v1/chat/completions", server.base_url().trim_end_matches('/'));
        let reply = post_openai_chat(
            &url,
            "test-model",
            "system",
            &[("user", "hello")],
            "test-key",
            false,
            AuthStyle::Bearer,
        )
        .expect("request");
        assert_eq!(reply, "mock reply");
        mock.assert();
    }

    #[test]
    fn azure_chat_url_builds_deployment_path() {
        let url = azure_chat_url("https://my-resource.openai.azure.com", "gpt-4o").expect("url");
        assert!(url.contains("/deployments/gpt-4o/chat/completions"));
        assert!(url.contains("api-version="));
    }
}
