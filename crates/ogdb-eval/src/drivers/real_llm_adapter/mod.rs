//! Real-LLM adapter family for Dimension 4. Picks between a deterministic
//! mock, Anthropic Messages API, OpenAI Chat Completions API, or a local
//! OpenAI-compatible server based on env vars. Every HTTP call retries on
//! 429 / 503 with exponential backoff and maps errors deterministically.
//!
//! See `.planning/real-llm-adapter/PLAN.md`. Default `cargo test -p
//! ogdb-eval` never touches the network — `provider_from_env()` defaults
//! to `Provider::Mock` and the factory returns `DeterministicMockAdapter`.

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
    /// Read `OGDB_LLM_MAX_RETRIES` + `OGDB_LLM_RETRY_BASE_MS`; fall back
    /// to the `DEFAULT_*` constants on parse errors or missing vars.
    pub fn from_env() -> Self {
        let max_retries = std::env::var(MAX_RETRIES_ENV)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_MAX_RETRIES);
        let base_ms = std::env::var(RETRY_BASE_MS_ENV)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_RETRY_BASE_MS);
        Self {
            max_retries,
            base_ms,
        }
    }

    pub fn defaults() -> Self {
        Self {
            max_retries: DEFAULT_MAX_RETRIES,
            base_ms: DEFAULT_RETRY_BASE_MS,
        }
    }
}

/// Deterministic in-process stand-in — byte-identical across invocations.
/// Default factory return when `OGDB_SKILL_LLM_PROVIDER` is unset or
/// `"mock"`. Zero I/O, zero clock reads, zero network.
pub struct DeterministicMockAdapter;

impl Default for DeterministicMockAdapter {
    fn default() -> Self {
        Self
    }
}

impl LlmAdapter for DeterministicMockAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        Ok(AdapterResponse {
            text: format!("[mock] {}", case.input),
            latency_us: 0,
        })
    }
}

/// Parse `OGDB_SKILL_LLM_PROVIDER` (default `"mock"`) into a `Provider`.
/// Unknown values surface as `Err(Adapter("unknown provider …"))`.
pub fn provider_from_env() -> Result<Provider, SkillQualityError> {
    let raw = std::env::var(PROVIDER_ENV).unwrap_or_else(|_| "mock".into());
    match raw.as_str() {
        "mock" => Ok(Provider::Mock),
        "anthropic" => Ok(Provider::Anthropic),
        "openai" => Ok(Provider::OpenAi),
        "local" => Ok(Provider::Local),
        other => Err(SkillQualityError::Adapter(format!(
            "unknown provider {other:?}; expected mock|anthropic|openai|local"
        ))),
    }
}

/// Runtime factory. `#[cfg]` branches compile to error returns when the
/// corresponding feature is not enabled. Never panics.
pub fn resolve_adapter() -> Result<Box<dyn LlmAdapter>, SkillQualityError> {
    match provider_from_env()? {
        Provider::Mock => Ok(Box::new(DeterministicMockAdapter)),
        Provider::Anthropic => {
            #[cfg(feature = "llm-anthropic")]
            {
                return Ok(Box::new(anthropic::AnthropicAdapter::from_env()?));
            }
            #[cfg(not(feature = "llm-anthropic"))]
            {
                Err(SkillQualityError::Adapter(
                    "provider=anthropic but crate built without feature llm-anthropic".into(),
                ))
            }
        }
        Provider::OpenAi => {
            #[cfg(feature = "llm-openai")]
            {
                return Ok(Box::new(openai::OpenAiAdapter::from_env()?));
            }
            #[cfg(not(feature = "llm-openai"))]
            {
                Err(SkillQualityError::Adapter(
                    "provider=openai but crate built without feature llm-openai".into(),
                ))
            }
        }
        Provider::Local => {
            #[cfg(feature = "llm-local")]
            {
                return Ok(Box::new(local::LocalAdapter::from_env()?));
            }
            #[cfg(not(feature = "llm-local"))]
            {
                Err(SkillQualityError::Adapter(
                    "provider=local but crate built without feature llm-local".into(),
                ))
            }
        }
    }
}

/// Shared retry + error-mapping policy used by every real adapter. The
/// `build` closure must be callable more than once because a retry
/// re-issues the same HTTP request. See PLAN §3 for the deterministic
/// error-mapping table this implements.
#[cfg(any(
    feature = "llm-anthropic",
    feature = "llm-openai",
    feature = "llm-local"
))]
pub(super) fn post_with_retry<F>(
    build: F,
    retry: RetryPolicy,
) -> Result<serde_json::Value, SkillQualityError>
where
    F: Fn() -> reqwest::blocking::RequestBuilder,
{
    let mut attempt: u32 = 0;
    loop {
        match build().send() {
            Err(e) => {
                let transient = e.is_timeout() || e.is_connect();
                if transient && attempt < retry.max_retries {
                    std::thread::sleep(std::time::Duration::from_millis(
                        retry.base_ms << attempt,
                    ));
                    attempt += 1;
                    continue;
                }
                return Err(SkillQualityError::Adapter(format!("http: {e}")));
            }
            Ok(resp) => {
                let status = resp.status();
                if status == reqwest::StatusCode::TOO_MANY_REQUESTS
                    || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
                {
                    if attempt < retry.max_retries {
                        std::thread::sleep(std::time::Duration::from_millis(
                            retry.base_ms << attempt,
                        ));
                        attempt += 1;
                        continue;
                    }
                    return Err(SkillQualityError::Adapter(format!(
                        "rate limit: {}",
                        status.as_u16()
                    )));
                }
                if !status.is_success() {
                    return Err(SkillQualityError::Adapter(format!(
                        "status: {}",
                        status.as_u16()
                    )));
                }
                return resp
                    .json::<serde_json::Value>()
                    .map_err(|e| SkillQualityError::Adapter(format!("json: {e}")));
            }
        }
    }
}
