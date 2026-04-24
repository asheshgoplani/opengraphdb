//! Local OpenAI-compatible LLM adapter (ollama / llama.cpp / vllm).

#![cfg(feature = "llm-local")]

use std::time::{Duration, Instant};

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

use super::{post_with_retry, RetryPolicy, DEFAULT_TIMEOUT_MS, TIMEOUT_MS_ENV};

pub const URL_ENV: &str = "OGDB_LOCAL_LLM_URL";
pub const MODEL_ENV: &str = "OGDB_LOCAL_LLM_MODEL";
pub const DEFAULT_MODEL: &str = "local-model";

pub struct LocalAdapter {
    url: String,
    model: String,
    retry: RetryPolicy,
    timeout: Duration,
}

impl LocalAdapter {
    /// Read `OGDB_LOCAL_LLM_URL` (required) + `OGDB_LOCAL_LLM_MODEL`
    /// (optional, default `"local-model"`).
    pub fn from_env() -> Result<Self, SkillQualityError> {
        let url = std::env::var(URL_ENV)
            .map_err(|_| SkillQualityError::Adapter(format!("{URL_ENV} not set")))?;
        let model = std::env::var(MODEL_ENV).unwrap_or_else(|_| DEFAULT_MODEL.to_string());
        Self::with_config(url, model, RetryPolicy::from_env())
    }

    pub fn with_config(
        url: String,
        model: String,
        retry: RetryPolicy,
    ) -> Result<Self, SkillQualityError> {
        let timeout_ms = std::env::var(TIMEOUT_MS_ENV)
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_TIMEOUT_MS);
        Ok(Self {
            url,
            model,
            retry,
            timeout: Duration::from_millis(timeout_ms),
        })
    }
}

impl LlmAdapter for LocalAdapter {
    fn respond(&self, case: &EvalCase) -> Result<AdapterResponse, SkillQualityError> {
        let http = reqwest::blocking::Client::builder()
            .timeout(self.timeout)
            .build()
            .map_err(|e| SkillQualityError::Adapter(format!("http client: {e}")))?;
        let body = serde_json::json!({
            "model": self.model,
            "messages": [{ "role": "user", "content": case.input }],
        });
        let t0 = Instant::now();
        let value = post_with_retry(
            || {
                http.post(&self.url)
                    .header("content-type", "application/json")
                    .json(&body)
            },
            self.retry,
        )?;
        let text = value
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|m| m.get("message"))
            .and_then(|m| m.get("content"))
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
