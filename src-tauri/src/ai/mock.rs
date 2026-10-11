pub const MOCK_PROVIDER_ID: &str = "fake";

/// In-memory LLM responses for manual QA and agents — debug builds only.
pub fn is_dev_mock_provider(provider_id: &str) -> bool {
    cfg!(debug_assertions) && provider_id.trim().eq_ignore_ascii_case(MOCK_PROVIDER_ID)
}
