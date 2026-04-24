//! OpenAI Chat Completions adapter.

#![cfg(feature = "llm-openai")]

use std::time::{Duration, Instant};

use crate::drivers::skill_quality::{
    AdapterResponse, EvalCase, LlmAdapter, SkillQualityError,
};

use super::{post_with_retry, RetryPolicy, DEFAULT_TIMEOUT_MS, TIMEOUT_MS_ENV};

pub const API_KEY_ENV: &str = "OPENAI_API_KEY";
pub const API_URL_ENV: &str = "OPENAI_API_URL";
pub const MODEL_ENV: &str = "OPENAI_MODEL";
pub const DEFAULT_URL: &str = "https://api.openai.com/v1/chat/completions";
pub const DEFAULT_MODEL: &str = "gpt-4o-mini";

pub struct OpenAiAdapter {
    url: String,
    api_key: String,
    model: String,
    retry: RetryPolicy,
    timeout: Duration,
}

impl OpenAiAdapter {
    pub fn from_env() -> Result<Self, SkillQualityError> {
        let api_key = std::env::var(API_KEY_ENV).map_err(|_| {
            SkillQualityError::Adapter(format!("{API_KEY_ENV} not set"))
        })?;
        let url = std::env::var(API_URL_ENV).unwrap_or_else(|_| DEFAULT_URL.to_string());
        let model = std::env::var(MODEL_ENV).unwrap_or_else(|_| DEFAULT_MODEL.to_string());
        Self::with_config(url, api_key, model, RetryPolicy::from_env())
    }

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

impl LlmAdapter for OpenAiAdapter {
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
                    .header("authorization", format!("Bearer {}", self.api_key))
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
