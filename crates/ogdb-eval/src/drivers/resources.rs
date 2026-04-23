//! Resource-use driver (spec Dimension 3).
//!
//! `measure` wraps any workload closure and returns an `EvaluationRun`
//! carrying RSS peak/final, disk-bytes delta, user-space CPU seconds, and
//! wall-clock elapsed. RSS peak is sampled via `/proc/self/status` (Linux
//! only; 0 elsewhere). CPU time comes from `/proc/self/stat` utime. On
//! non-Linux platforms the numbers are emitted as 0 — callers tolerate that
//! the same way `common::process_rss_bytes` already does.

use std::path::Path;
use std::time::Instant;

use crate::drivers::common::{dir_disk_bytes, evaluation_run_skeleton, metric, process_rss_bytes};
use crate::EvaluationRun;

#[derive(Debug, thiserror::Error)]
pub enum ResourceError {
    #[error("workload error: {0}")]
    Workload(String),
}

/// Snapshot of resource use taken at a particular instant. Fields default to
/// 0 on platforms where the underlying probe isn't available (e.g. `/proc`
/// on non-Linux).
#[derive(Debug, Clone, Copy, Default)]
pub struct ResourceSample {
    pub rss_bytes: u64,
    pub disk_bytes: u64,
}

impl ResourceSample {
    pub fn from_dir(dir: &Path) -> Self {
        Self {
            rss_bytes: process_rss_bytes(),
            disk_bytes: dir_disk_bytes(dir),
        }
    }
}

/// Run `workload`, record resource samples before and after, and pack the
/// deltas into an EvaluationRun. The workload closure returns its own final
/// `ResourceSample` (so it can be taken after workload-local state has
/// settled — e.g. after a DB commit). The driver also queries RSS directly
/// afterwards as a second data point for peak detection.
pub fn measure<F>(
    workload_suite: &str,
    workload_subsuite: &str,
    dataset: &str,
    workload: F,
) -> Result<EvaluationRun, ResourceError>
where
    F: FnOnce() -> ResourceSample,
{
    let rss_before = process_rss_bytes();
    let cpu_before = read_cpu_user_ticks();
    let t0 = Instant::now();
    let final_sample = workload();
    let elapsed_s = t0.elapsed().as_secs_f64();
    let rss_after = process_rss_bytes();
    let cpu_after = read_cpu_user_ticks();

    let rss_peak = rss_before.max(rss_after).max(final_sample.rss_bytes);
    let rss_final_mb = final_sample.rss_bytes as f64 / (1024.0 * 1024.0);
    let rss_peak_mb = rss_peak as f64 / (1024.0 * 1024.0);
    let disk_mb = final_sample.disk_bytes as f64 / (1024.0 * 1024.0);
    let cpu_user_s = ticks_to_seconds(cpu_after.saturating_sub(cpu_before));

    let subsuite = format!("{workload_suite}.{workload_subsuite}");
    let mut run = evaluation_run_skeleton("resources", &subsuite, dataset);
    run.metrics
        .insert("rss_peak_mb".to_string(), metric(rss_peak_mb, "MB", false));
    run.metrics
        .insert("rss_final_mb".to_string(), metric(rss_final_mb, "MB", false));
    run.metrics
        .insert("disk_mb".to_string(), metric(disk_mb, "MB", false));
    run.metrics
        .insert("cpu_user_s".to_string(), metric(cpu_user_s, "s", false));
    run.metrics
        .insert("elapsed_s".to_string(), metric(elapsed_s, "s", false));
    run.notes = format!(
        "resources around {workload_suite}.{workload_subsuite}; linux-only proc probes"
    );
    Ok(run)
}

fn read_cpu_user_ticks() -> u64 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(s) = std::fs::read_to_string("/proc/self/stat") {
            // Field 14 (1-indexed) is utime. We must be careful: field 2 is
            // the command name wrapped in parens and may contain spaces, so
            // split on the last ')' first.
            if let Some(idx) = s.rfind(')') {
                let rest = &s[idx + 1..];
                let parts: Vec<&str> = rest.split_whitespace().collect();
                // rest[0] = state, rest[1] = ppid, ..., utime is rest[11] (0-idx)
                // because field 3 becomes rest[0]. utime is field 14,
                // which is rest[14-3] = rest[11].
                if parts.len() > 11 {
                    if let Ok(ticks) = parts[11].parse::<u64>() {
                        return ticks;
                    }
                }
            }
        }
    }
    0
}

fn ticks_to_seconds(ticks: u64) -> f64 {
    // Most Linux distros use CLK_TCK=100. We avoid pulling `libc` here to
    // keep ogdb-eval lean; the bench crate already does the same.
    let hz = 100.0;
    ticks as f64 / hz
}
