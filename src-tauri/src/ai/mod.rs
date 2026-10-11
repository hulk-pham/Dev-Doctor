mod adapters;
mod chat;
mod chat_store;
mod credentials;
mod diagnosis;
mod http;
mod inflight;
mod mock;
mod provider;
mod settings;

pub use chat::{chat, chat_async, AiChatTurn};
pub use credentials::{delete_api_key, is_configured_for_settings, store_api_key, ApiKeyProvider};
pub use diagnosis::{diagnose, diagnose_async, test_connection, AiDiagnosisResponse, AiError, AiErrorCode};
pub use chat_store::{load_chat_store_json, save_chat_store_json};
pub use inflight::AiInflight;
pub use mock::is_dev_mock_provider;
pub use settings::{load_ai_settings, save_ai_settings, AiSettings};
