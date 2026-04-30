// Cache invalidation for the embedded SPA dist (Slice S7).
//
// `crates/ogdb-cli/src/static_assets.rs` calls `include_dir!` on
// `../../frontend/dist-app`. Without this hint, Cargo only re-runs the
// proc-macro when source files in `crates/ogdb-cli/src/` change — so a
// fresh `npm run build:app` would NOT re-bake the new bundle into the
// binary. Watching the dist directory closes that gap.
//
// CI workflows that build the binary without first running `npm run
// build:app` (e.g. verify-claims) would hit a proc-macro panic because
// the directory does not exist. Create an empty placeholder so the
// `include_dir!` invocation finds an empty Dir; runtime SPA-fallback
// still works (no SPA = serve API only).
fn main() {
    use std::fs;
    use std::path::PathBuf;

    let dist_app = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("frontend")
        .join("dist-app");

    if !dist_app.exists() {
        let _ = fs::create_dir_all(&dist_app);
    }

    println!("cargo:rerun-if-changed=../../frontend/dist-app");
}
