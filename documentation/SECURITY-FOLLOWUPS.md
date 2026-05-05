# Security follow-ups

Tracked deferrals from `cargo audit` / `cargo deny check advisories` whose
fix is non-trivial. Each entry must point to the corresponding `deny.toml`
ignore so that removing the deferral and removing the ignore happen in the
same commit.

## pyo3 — RUSTSEC-2025-0020 — buffer-overflow risk in PyString::from_object

- **Affected version:** pyo3 0.21.2 (transitive via `crates/ogdb-python`).
- **Fix available in:** pyo3 0.24.1.
- **Why deferred:** pyo3 0.21 → 0.24 is a major API migration that touches
  every `#[pyclass]` / `#[pyfunction]` site in `crates/ogdb-python`. The
  python binding is **not in the default feature set** of any publishable
  crate, so the vulnerable code is not on the path of a default
  `cargo install` or `cargo build`.
- **Action item:** bump pyo3 0.21 → ≥ 0.24.1 and remove the
  `RUSTSEC-2025-0020` ignore from `deny.toml` in the same commit. Owner:
  python-bindings maintainer. Target: v0.6 minor (slipped from original v0.5 target — pyo3 binding migration was not in scope for the 0.4.0 → 0.5.x line).
- **Status as of 2026-05-05:** ignore still in `deny.toml`, pyo3 still at 0.21.
- **Release-notes wording when shipped:**

  > The `ogdb-python` crate continues to depend on pyo3 0.21, which has a
  > known advisory (RUSTSEC-2025-0020) for `PyString::from_object`. The
  > python binding is opt-in (`--features python`) and is not built by
  > default. A pyo3 0.24 migration is tracked as a post-v0.5 task. If you
  > build the python binding from source, audit your call sites for
  > `PyString::from_object` usage.

## lru — RUSTSEC-2026-0002 — unsound IterMut

- **Affected version:** lru 0.12.5 (transitive via tantivy 0.25).
- **Fix available in:** lru ≥ 0.13.
- **Why deferred:** tantivy 0.25 pins lru 0.12; lru 0.13+ requires tantivy
  to bump. No safe upgrade path under our control.
- **Action item:** track tantivy 0.26 release; bump and remove the
  `RUSTSEC-2026-0002` ignore in the same commit.

## rand — RUSTSEC-2026-0097 — custom-logger unsoundness

- **Affected version:** rand 0.8 / 0.9 (transitive via tower /
  instant-distance / proptest / oxrdf / reqwest / quinn-proto).
- **Why deferred:** all transitive; no upstream patches yet.
- **Action item:** review the dep tree on every patch release of rand
  (`cargo tree -p rand`) and remove the `RUSTSEC-2026-0097` ignore once
  every consumer has bumped.
