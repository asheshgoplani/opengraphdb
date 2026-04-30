// Cache invalidation for the embedded SPA dist (Slice S7).
//
// `crates/ogdb-cli/src/static_assets.rs` calls `include_dir!` on
// `../../frontend/dist-app`. Without this hint, Cargo only re-runs the
// proc-macro when source files in `crates/ogdb-cli/src/` change — so a
// fresh `npm run build:app` would NOT re-bake the new bundle into the
// binary. Watching the dist directory closes that gap.
fn main() {
    println!("cargo:rerun-if-changed=../../frontend/dist-app");
}
