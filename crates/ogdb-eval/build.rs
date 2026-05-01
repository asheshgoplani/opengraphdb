//! Emits `GIT_SHA=<12-char-short-sha>` so `option_env!("GIT_SHA")` in
//! `src/drivers/common.rs` populates `EvaluationRun::git_sha` instead of the
//! legacy `"unknown"` literal. Without this, every published baseline JSON
//! is unreproducible (see EVAL-PERF-RELEASE.md Finding 1).

fn main() {
    let sha = std::process::Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok()
            } else {
                None
            }
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into());

    println!("cargo:rustc-env=GIT_SHA={}", sha);
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs");
    println!("cargo:rerun-if-changed=build.rs");
}
