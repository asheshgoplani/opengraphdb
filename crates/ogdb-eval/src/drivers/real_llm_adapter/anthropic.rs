//! Anthropic Messages API adapter.

#![cfg(feature = "llm-anthropic")]

use std::time::{Duration, Instant};

use crate::drivers::skill_quality::{AdapterResponse, EvalCase, LlmAdapter, SkillQualityError};

use super::{post_with_retry, RetryPolicy, DEFAULT_TIMEOUT_MS, TIMEOUT_MS_ENV};

pub const API_KEY_ENV: &str = "ANTHROPIC_API_KEY";
pub const API_URL_ENV: &str = "ANTHROPIC_API_URL";
pub const MODEL_ENV: &str = "ANTHROPIC_MODEL";
pub const DEFAULT_URL: &str = "https://api.anthropic.com/v1/messages";
pub const DEFAULT_MODEL: &str = "claude-haiku-4-5";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";

/// The `reqwest::blocking::Client` is constructed lazily inside
/// `respond` rather than stored, because `reqwest::blocking` spawns its
/// own Tokio runtime for each Client and dropping that runtime inside
/// an async context panics (see tokio `shutdown.rs`). Lazy construction
/// keeps create + drop on the same `spawn_blocking` worker thread.
pub struct AnthropicAdapter {
    url: String,
    api_key: String,
    model: String,
    retry: RetryPolicy,
    timeout: Duration,
}

impl AnthropicAdapter {
    /// Read URL / key / model from env. `Err(Adapter("ANTHROPIC_API_KEY …"))`
    /// if the key is absent.
    pub fn from_env() -> Result<Self, SkillQualityError> {
        let api_key = std::env::var(API_KEY_ENV)
            .map_err(|_| SkillQualityError::Adapter(format!("{API_KEY_ENV} not set")))?;
        let url = std::env::var(API_URL_ENV).unwrap_or_else(|_| DEFAULT_URL.to_string());
        let model = std::env::var(MODEL_ENV).unwrap_or_else(|_| DEFAULT_MODEL.to_string());
        Self::with_config(url, api_key, model, RetryPolicy::from_env())
    }

    /// Test-only constructor — bypasses env, takes explicit config so
    /// wiremock tests can inject a server URL + dummy key.
    pub fn with_config(
        url: String,
        api_key: String,
        model: String,
        retry: RetryPolicy,
    ) -> Result<Self, SkillQualityError> {
        let timeout_ms = std::env::var(TIMEOUT_MS_ENV)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_TIMEOUT_MS);
        Ok(Self {
            url,
            api_key,
            model,
            retry,
            timeout: Duration::from_millis(timeout_ms),
        })
    }
}

impl LlmAdapter for AnthropicAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        let http = reqwest::blocking::Client::builder()
            .timeout(self.timeout)
            .build()
            .map_err(|e| SkillQualityError::Adapter(format!("http client: {e}")))?;
        let body = serde_json::json!({
            "model": self.model,
            "max_tokens": 1024,
            "messages": [{ "role": "user", "content": case.input }],
        });
        let t0 = Instant::now();
        let value = post_with_retry(
            || {
                http.post(&self.url)
                    .header("x-api-key", &self.api_key)
                    .header("anthropic-version", ANTHROPIC_VERSION)
                    .header("content-type", "application/json")
                    .json(&body)
            },
            self.retry,
        )?;
        let text = value
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|m| m.get("text"))
            .and_then(|t| t.as_str())
            .ok_or_else(|| SkillQualityError::Adapter("no text".into()))?
            .to_string();
        let elapsed = t0.elapsed().as_micros() as u64;
        Ok(AdapterResponse {
            text,
            latency_us: elapsed.max(1),
        })
    }
}
