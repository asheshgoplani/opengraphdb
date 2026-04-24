//! Local OpenAI-compatible LLM adapter (ollama / llama.cpp / vllm) —
//! Phase 2 stub.

#![cfg(feature = "llm-local")]

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

use super::RetryPolicy;

pub const URL_ENV: &str = "OGDB_LOCAL_LLM_URL";
pub const MODEL_ENV: &str = "OGDB_LOCAL_LLM_MODEL";
pub const DEFAULT_MODEL: &str = "local-model";

pub struct LocalAdapter {
    _priv: (),
}

impl LocalAdapter {
    /// Read `OGDB_LOCAL_LLM_URL` (required) + `OGDB_LOCAL_LLM_MODEL`
    /// (optional, default `"local-model"`).
    pub fn from_env() -> Result<Self, SkillQualityError> {
        unimplemented!("LocalAdapter::from_env lands in Phase 3")
    }

    pub fn with_config(
        _url: String,
        _model: String,
        _retry: RetryPolicy,
    ) -> Result<Self, SkillQualityError> {
        unimplemented!("LocalAdapter::with_config lands in Phase 3")
    }
}

impl LlmAdapter for LocalAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        unimplemented!("LocalAdapter::respond lands in Phase 3")
    }
}
