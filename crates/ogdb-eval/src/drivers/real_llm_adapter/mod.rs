//! Real-LLM adapter family for Dimension 4 — Phase 2 stubs.
//!
//! See `.planning/real-llm-adapter/PLAN.md` for the full design. Every
//! public function below is an `unimplemented!()` stub that Phase 3
//! (GREEN) fills in. The `Cargo.toml` features and dev-deps land in
//! this same Phase 2 RED commit so the test binaries compile.

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

#[cfg(feature = "llm-anthropic")]
pub mod anthropic;
#[cfg(feature = "llm-local")]
pub mod local;
#[cfg(feature = "llm-openai")]
pub mod openai;

pub const PROVIDER_ENV: &str = "OGDB_SKILL_LLM_PROVIDER";
pub const MAX_RETRIES_ENV: &str = "OGDB_LLM_MAX_RETRIES";
pub const RETRY_BASE_MS_ENV: &str = "OGDB_LLM_RETRY_BASE_MS";
pub const TIMEOUT_MS_ENV: &str = "OGDB_LLM_TIMEOUT_MS";

pub const DEFAULT_MAX_RETRIES: u32 = 3;
pub const DEFAULT_RETRY_BASE_MS: u64 = 250;
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Mock,
    Anthropic,
    OpenAi,
    Local,
}

#[derive(Debug, Clone, Copy)]
pub struct RetryPolicy {
    pub max_retries: u32,
    pub base_ms: u64,
}

impl RetryPolicy {
    /// Read `OGDB_LLM_MAX_RETRIES` + `OGDB_LLM_RETRY_BASE_MS`.
    pub fn from_env() -> Self {
        let _ = (MAX_RETRIES_ENV, RETRY_BASE_MS_ENV);
        unimplemented!("RetryPolicy::from_env lands in Phase 3")
    }

    pub fn defaults() -> Self {
        Self {
            max_retries: DEFAULT_MAX_RETRIES,
            base_ms: DEFAULT_RETRY_BASE_MS,
        }
    }
}

/// Deterministic in-process stand-in. Default factory return when
/// `OGDB_SKILL_LLM_PROVIDER` is unset or `"mock"`. Phase 3 implements
/// the `respond` body as `"[mock] " + case.input`.
pub struct DeterministicMockAdapter;

impl Default for DeterministicMockAdapter {
    fn default() -> Self {
        Self
    }
}

impl LlmAdapter for DeterministicMockAdapter {
    fn respond(&self, _case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        unimplemented!("DeterministicMockAdapter::respond lands in Phase 3")
    }
}

/// Parse `OGDB_SKILL_LLM_PROVIDER` (default `"mock"`) into a `Provider`.
/// Unknown values ⇒ `Err(Adapter(...))`.
pub fn provider_from_env() -> Result<Provider, SkillQualityError> {
    unimplemented!("provider_from_env lands in Phase 3")
}

/// Runtime factory. `#[cfg]` branches compile to error returns when the
/// corresponding feature is not enabled. Never panics.
pub fn resolve_adapter() -> Result<Box<dyn LlmAdapter>, SkillQualityError> {
    unimplemented!("resolve_adapter lands in Phase 3")
}
