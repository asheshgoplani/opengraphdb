//! Shared helpers for the Phase 5 drivers — host metadata, percentile
//! computation, RSS / disk-size measurement. None of these are exposed by
//! `ogdb-core`'s public API, so we replicate the lightweight equivalents
//! that `ogdb-bench` already uses (per the audit on 2026-04-23).

use std::collections::BTreeMap;
use std::path::Path;
use std::time::SystemTime;

use crate::{BinaryInfo, EvaluationRun, Metric, Platform, SCHEMA_VERSION};

/// Build a baseline `EvaluationRun` with platform/binary/timestamp filled in.
/// Callers add `metrics`, `notes`, etc.
pub fn evaluation_run_skeleton(suite: &str, subsuite: &str, dataset: &str) -> EvaluationRun {
    EvaluationRun {
        schema_version: SCHEMA_VERSION.to_string(),
        run_id: format!(
            "{suite}-{subsuite}-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ),
        suite: suite.to_string(),
        subsuite: subsuite.to_string(),
        dataset: dataset.to_string(),
        timestamp_utc: timestamp_utc(),
        git_sha: option_env!("GIT_SHA").unwrap_or("unknown").to_string(),
        platform: Platform {
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            cpu_model: read_cpu_model(),
            ram_gb: 0,
        },
        binary: BinaryInfo {
            version: env!("CARGO_PKG_VERSION").to_string(),
            build_profile: if cfg!(debug_assertions) {
                "debug".to_string()
            } else {
                "release".to_string()
            },
        },
        metrics: BTreeMap::new(),
        environment: BTreeMap::new(),
        notes: String::new(),
    }
}

pub fn metric(value: f64, unit: &str, higher_is_better: bool) -> Metric {
    Metric {
        value,
        unit: unit.to_string(),
        higher_is_better,
    }
}

/// Compute (p50, p95, p99) from a slice of sample values. Uses
/// nearest-rank: index = ceil(p * N) - 1. Returns `(0, 0, 0)` for empty
/// input.
pub fn percentiles(samples_us: &[f64]) -> (f64, f64, f64) {
    if samples_us.is_empty() {
        return (0.0, 0.0, 0.0);
    }
    let mut sorted = samples_us.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let pick = |p: f64| -> f64 {
        let n = sorted.len();
        let idx = ((p * n as f64).ceil() as usize)
            .saturating_sub(1)
            .min(n - 1);
        sorted[idx]
    };
    (pick(0.50), pick(0.95), pick(0.99))
}

/// Extended percentile set — (p50, p95, p99, p99_9). Spec Dimension 2
/// requires the full tail, and pure-graph workloads routinely have
/// p99.9 ≫ p99 under GC / page-cache-miss events.
pub fn percentiles_extended(samples_us: &[f64]) -> (f64, f64, f64, f64) {
    if samples_us.is_empty() {
        return (0.0, 0.0, 0.0, 0.0);
    }
    let mut sorted = samples_us.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let pick = |p: f64| -> f64 {
        let n = sorted.len();
        let idx = ((p * n as f64).ceil() as usize)
            .saturating_sub(1)
            .min(n - 1);
        sorted[idx]
    };
    (pick(0.50), pick(0.95), pick(0.99), pick(0.999))
}

/// Sum file sizes under `dir`, recursing once. Used by the scaling driver.
/// Returns 0 if `dir` doesn't exist.
pub fn dir_disk_bytes(dir: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_file() {
            total += meta.len();
        } else if meta.is_dir() {
            total += dir_disk_bytes(&entry.path());
        }
    }
    total
}

/// Best-effort RSS in bytes via `/proc/self/status` (Linux). Returns 0 on
/// other OSes or if the read fails — callers tolerate `rss_mb=0`.
pub fn process_rss_bytes() -> u64 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/self/status") {
            for line in s.lines() {
                if let Some(rest) = line.strip_prefix("VmRSS:") {
                    let kb: u64 = rest
                        .split_whitespace()
                        .next()
                        .and_then(|t| t.parse().ok())
                        .unwrap_or(0);
                    return kb * 1024;
                }
            }
        }
    }
    0
}

fn read_cpu_model() -> String {
    #[cfg(target_os = "linux")]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/cpuinfo") {
            for line in s.lines() {
                if let Some(rest) = line.strip_prefix("model name") {
                    if let Some(idx) = rest.find(':') {
                        return rest[idx + 1..].trim().to_string();
                    }
                }
            }
        }
    }
    "unknown".to_string()
}

/// `YYYY-MM-DDTHH:MM:SSZ`, computed without pulling in `chrono`. Good enough
/// for run-id ordering and the schema's `timestamp_utc` field.
fn timestamp_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, mo, d, h, mi, s) = epoch_to_ymdhms(secs);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

fn epoch_to_ymdhms(secs: u64) -> (i32, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let s_today = (secs % 86_400) as u32;
    let h = s_today / 3600;
    let mi = (s_today % 3600) / 60;
    let s = s_today % 60;

    // Algorithm from Howard Hinnant's date library — civil_from_days.
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if mo <= 2 { y + 1 } else { y } as i32;
    (y, mo, d, h, mi, s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentiles_basic() {
        let xs: Vec<f64> = (1..=100).map(|i| i as f64).collect();
        let (p50, p95, p99) = percentiles(&xs);
        assert_eq!(p50, 50.0);
        assert_eq!(p95, 95.0);
        assert_eq!(p99, 99.0);
    }

    #[test]
    fn percentiles_empty_returns_zero() {
        assert_eq!(percentiles(&[]), (0.0, 0.0, 0.0));
    }

    #[test]
    fn percentiles_single_sample() {
        assert_eq!(percentiles(&[42.0]), (42.0, 42.0, 42.0));
    }

    #[test]
    fn timestamp_format_matches_schema() {
        let s = timestamp_utc();
        assert_eq!(s.len(), 20, "got {s}");
        assert!(s.ends_with('Z'));
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[10..11], "T");
    }
}
