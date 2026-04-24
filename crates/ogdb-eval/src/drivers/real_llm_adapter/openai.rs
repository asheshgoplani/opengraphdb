//! OpenAI Chat Completions adapter — Phase 2 stub.

#![cfg(feature = "llm-openai")]

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

use super::RetryPolicy;

pub const API_KEY_ENV: &str = "OPENAI_API_KEY";
pub const API_URL_ENV: &str = "OPENAI_API_URL";
pub const MODEL_ENV: &str = "OPENAI_MODEL";
pub const DEFAULT_URL: &str = "https://api.openai.com/v1/chat/completions";
pub const DEFAULT_MODEL: &str = "gpt-4o-mini";

pub struct OpenAiAdapter {
    _priv: (),
}

impl OpenAiAdapter {
    pub fn from_env() -> Result<Self, SkillQualityError> {
        unimplemented!("OpenAiAdapter::from_env lands in Phase 3")
    }

    pub fn with_config(
        _url: String,
        _api_key: String,
        _model: String,
        _retry: RetryPolicy,
    ) -> Result<Self, SkillQualityError> {
        unimplemented!("OpenAiAdapter::with_config lands in Phase 3")
    }
}

impl LlmAdapter for OpenAiAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        unimplemented!("OpenAiAdapter::respond lands in Phase 3")
    }
}
