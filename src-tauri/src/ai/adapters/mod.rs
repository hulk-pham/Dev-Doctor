mod anthropic;
mod gemini;
mod openai_compat;

pub use anthropic::AnthropicAdapter;
pub use gemini::GeminiAdapter;
pub use openai_compat::{azure_chat_url, post_openai_chat_async, AuthStyle, OpenAiCompatAdapter};

pub const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
pub const GROQ_CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
pub const TOGETHER_CHAT_URL: &str = "https://api.together.xyz/v1/chat/completions";
pub const OPENROUTER_CHAT_URL: &str = "https://openrouter.ai/api/v1/chat/completions";
pub const OLLAMA_DEFAULT_URL: &str = "http://127.0.0.1:11434/v1/chat/completions";
pub const AZURE_API_VERSION: &str = "2024-02-15-preview";
