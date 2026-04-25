//! CPU-frequency governor probe + best-effort set.
//!
//! The bench box's read-path latency variance is dominated by the
//! `powersave` governor's clock-ramp behaviour: cold-cache iter-1 can be
//! 40–70 % slower than warm iters because the scheduler hasn't ramped to
//! P0 yet. Pinning to `performance` flattens that.
//!
//! On Linux the governor lives at
//! `/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor`. Reading is
//! always allowed; writing requires root. We never escalate — if the
//! file is non-writeable, callers log a warning and proceed (the warm-up
//! driver pass is the more impactful lever anyway).
//!
//! On non-Linux platforms (or containers without cpufreq) the path
//! doesn't exist and we report `Unavailable`.

use std::fs;
use std::io;
use std::path::Path;

const GOVERNOR_PATH: &str = "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor";

/// Outcome of a governor probe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GovernorState {
    /// Governor file readable; current value reported.
    Available(String),
    /// Path missing (containers, non-Linux, kernel without cpufreq).
    Unavailable,
}

/// Read the current governor for cpu0. Returns `Unavailable` if the
/// sysfs path is missing or unreadable. Never panics.
pub fn detect_governor() -> GovernorState {
    detect_governor_at(Path::new(GOVERNOR_PATH))
}

/// Test seam — read the governor at an arbitrary path.
pub fn detect_governor_at(path: &Path) -> GovernorState {
    match fs::read_to_string(path) {
        Ok(s) => GovernorState::Available(s.trim().to_string()),
        Err(_) => GovernorState::Unavailable,
    }
}

/// Best-effort write of `target` ("performance" / "powersave" / etc.)
/// to the governor file. Returns `Err(io::Error)` when the file is
/// missing or not writeable (typical on the bench box without sudo) so
/// the caller can downgrade to a warning. Never panics.
pub fn try_set_governor(target: &str) -> io::Result<()> {
    try_set_governor_at(Path::new(GOVERNOR_PATH), target)
}

/// Test seam — write the governor at an arbitrary path.
pub fn try_set_governor_at(path: &Path, target: &str) -> io::Result<()> {
    fs::write(path, target)
}
