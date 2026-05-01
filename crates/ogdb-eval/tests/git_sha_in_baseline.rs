//! Regression test for EVAL-PERF-RELEASE Finding 1 (HIGH sub-issue): every
//! `EvaluationRun` was being stamped with `git_sha = "unknown"` because no
//! `build.rs` set the `GIT_SHA` env var that `drivers::common.rs:28` reads
//! via `option_env!("GIT_SHA")`. This test asserts that, when built inside a
//! git checkout, the baseline skeleton carries a real 12-char short SHA.

use ogdb_eval::drivers::common::evaluation_run_skeleton;

#[test]
fn baseline_skeleton_has_real_git_sha_when_built_in_checkout() {
    let run = evaluation_run_skeleton("test_suite", "test_subsuite", "test_dataset");

    // The build.rs added in this fix must set GIT_SHA at compile time when
    // built inside a git checkout. CI and dev workstations both qualify.
    // Source tarball builds (no .git/) are the only allowed "unknown" path.
    assert_ne!(
        run.git_sha, "unknown",
        "build.rs must emit GIT_SHA when built inside a git checkout — \
         baseline JSON must be reproducible to a commit (eval Finding 1)"
    );
    assert_eq!(
        run.git_sha.len(),
        12,
        "GIT_SHA must be a 12-character short SHA, got: {:?}",
        run.git_sha
    );
    assert!(
        run.git_sha.chars().all(|c| c.is_ascii_hexdigit()),
        "GIT_SHA must be hex, got: {:?}",
        run.git_sha
    );
}
