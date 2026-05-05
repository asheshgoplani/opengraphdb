// Workspace version label sourced from Cargo.toml at build time.
// vite.config.app.ts / vite.config.marketing.ts / vite.config.ts read
// `[workspace.package].version` and inject it via `define` as
// `import.meta.env.VITE_OGDB_VERSION`. Importing from a single constant
// keeps the hero badge, e2e regression specs, and any future surface from
// drifting against the actual shipped version (EVAL-DOCS-COMPLETENESS-CYCLE15
// F03: hard-coded `v0.3.0` survived two minor releases).
export const OGDB_VERSION: string =
  (import.meta.env.VITE_OGDB_VERSION as string | undefined) ?? '0.0.0-dev'
