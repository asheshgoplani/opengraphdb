// ogdb-fuzz: outer shell crate for libFuzzer targets.
//
// Fuzz targets live under the nested sub-workspace at
// crates/ogdb-fuzz/fuzz/. The outer crate exists only so the
// workspace-level `cargo test -p ogdb-fuzz --test targets_compile`
// check has a package to attach to — see .planning/fuzzing-harness/PLAN.md.
