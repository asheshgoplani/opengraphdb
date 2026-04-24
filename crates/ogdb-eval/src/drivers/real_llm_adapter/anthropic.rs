//! Anthropic Messages API adapter — Phase 2 stub.

#![cfg(feature = "llm-anthropic")]

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

use super::RetryPolicy;

pub const API_KEY_ENV: &str = "ANTHROPIC_API_KEY";
pub const API_URL_ENV: &str = "ANTHROPIC_API_URL";
pub const MODEL_ENV: &str = "ANTHROPIC_MODEL";
pub const DEFAULT_URL: &str = "https://api.anthropic.com/v1/messages";
pub const DEFAULT_MODEL: &str = "claude-haiku-4-5";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

/// Phase-3 fields (HTTP client, retry policy, key, model, url) materialise
/// in the GREEN commit. Keeping the struct opaque here so the test
/// constructor in §6 row 2 still compiles against the public API.
pub struct AnthropicAdapter {
    _priv: (),
}

impl AnthropicAdapter {
    /// Read URL / key / model from env. `Err(Adapter("ANTHROPIC_API_KEY …"))`
    /// if the key is absent.
    pub fn from_env() -> Result<Self, SkillQualityError> {
        unimplemented!("AnthropicAdapter::from_env lands in Phase 3")
    }

    /// Test-only constructor — bypasses env, takes explicit config so
    /// wiremock tests can inject a server URL + dummy key.
    pub fn with_config(
        _url: String,
        _api_key: String,
        _model: String,
        _retry: RetryPolicy,
    ) -> Result<Self, SkillQualityError> {
        unimplemented!("AnthropicAdapter::with_config lands in Phase 3")
    }
}

impl LlmAdapter for AnthropicAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        unimplemented!("AnthropicAdapter::respond lands in Phase 3")
    }
}
