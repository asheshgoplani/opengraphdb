# OpenGraphDB — Compatibility & SemVer Policy

**Status:** active as of v0.4.0 · 2026-05-01
**Source:** EVAL-PERF-RELEASE.md Finding 12 (HIGH) — `CHANGELOG.md` referenced "Semantic Versioning" without defining what that meant for this project's mix of Rust crates, on-disk file formats, CLI surface, and wire protocols. This document is the authoritative answer.

This policy applies starting with `v0.4.0`. Pre-`0.4` releases were experimental and not covered.

---

## 1. API SemVer (Rust crates)

Each `ogdb-*` crate published to crates.io follows **standard cargo SemVer**:

- **Patch (`0.4.0` → `0.4.1`).** Bug fixes only. No public-API additions, no removals, no signature changes. Existing dependents recompile and behave the same.
- **Minor (`0.4.0` → `0.5.0`).** Additive only. New types, new functions, new feature flags. Existing public items keep their signatures and semantics. Dependents pinned to `^0.4` may need to re-resolve dependencies but should not require source changes.
- **Major (`0.x` → `1.0` or later `1.x` → `2.x`).** Breaking changes allowed. Breakage is enumerated in `CHANGELOG.md` with migration notes.

**Pre-1.0 caveat:** while we are in `0.x`, the cargo convention is that **every minor bump is breaking**. We follow that convention strictly. `0.5.0` may break `0.4.0` consumers; `0.5.1` will not break `0.5.0`.

**Internal vs public.** Anything inside a `pub` item of a published crate is API surface. `pub(crate)`, `#[doc(hidden)]`, and items inside the dev-rig crates (`ogdb-bench`, `ogdb-eval`, `ogdb-e2e`, `ogdb-tck`, `ogdb-fuzz` — all `publish = false` per Finding 7) are not.

---

## 2. File-format SemVer

Five constants govern on-disk format compatibility, declared together in `crates/ogdb-core/src/lib.rs` (`crates/ogdb-core/src/lib.rs::META_FORMAT_VERSION`, `crates/ogdb-core/src/lib.rs::FREE_LIST_FORMAT_VERSION`, `crates/ogdb-core/src/lib.rs::CSR_LAYOUT_FORMAT_VERSION`, `crates/ogdb-core/src/lib.rs::NODE_PROPERTY_STORE_FORMAT_VERSION`, `crates/ogdb-core/src/lib.rs::VECTOR_INDEX_FORMAT_VERSION` — all `pub const` items, downstream crates may gate at compile time):

| Constant | Current | Governs |
|---|---|---|
| `META_FORMAT_VERSION` | `1` | `<db>.ogdb-meta.json` (catalogs, registries) |
| `FREE_LIST_FORMAT_VERSION` | `1` | `<db>.ogdb-freelist.json` |
| `CSR_LAYOUT_FORMAT_VERSION` | `1` | `<db>.ogdb-csr.json` |
| `NODE_PROPERTY_STORE_FORMAT_VERSION` | `1` | `<db>.ogdb-props*` |
| `VECTOR_INDEX_FORMAT_VERSION` | `1` | `<db>.ogdb.vecindex` |

**Policy:**

- **The five constants are internal but their *values* are observable on disk.** A bump to any of them may break readers of older databases unless an in-binary migration is shipped in the same release.
- **Within a `0.X.Y` minor:** constants must NOT bump. Patch releases never break file format.
- **Across minors (`0.4.x` → `0.5.0`):** a constant may bump, but only with:
  1. An accompanying migration (`ogdb migrate <db>` subcommand, currently aspirational per `DESIGN.md §38`).
  2. A `CHANGELOG.md` entry under the new version explicitly listing which constant bumped and what changed.
  3. The current binary continuing to **read** old format versions (write-only is the new format).
- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` ships a checked-in v0.4.0 fixture and asserts the current binary opens it. Any format-version bump that breaks readability fails this test in CI. Future releases add a v0.5.0 fixture beside it; the test scaffold is designed to grow.

**Why we don't version the file format independently of the workspace.** The format constants are tied to the binary that produced them; users get a single artifact. A separate file-format SemVer line would be cognitive overhead for the small number of cases where format actually changes within a workspace minor (zero so far).

---

## 3. CLI surface SemVer

The `ogdb` binary's CLI is part of the public contract:

- **Subcommand contracts stable within a minor.** `ogdb serve --http :8080` will keep meaning the same thing in any `0.5.*` patch release.
- **`--help`-reachable flags stable across `0.5.*`.** Flags may be added in patches; existing flags do not change name, short form, or behavior.
- **New subcommands additive.** `ogdb migrate` (when shipped) does not affect existing `serve`, `bolt`, `query`, etc.
- **Removal requires a minor bump** with the prior minor's release notes pre-announcing the removal.

---

## 4. Wire protocols

Bolt, HTTP, and MCP wire formats are versioned **independently** of the workspace `version`. This is on purpose: the protocols negotiate version on the wire (e.g. Bolt handshake), so binding their semver to the workspace would force needless wire-format churn on internal refactors.

| Surface | Versioning | Notes |
|---|---|---|
| Bolt v1 | `crates/ogdb-bolt/src/lib.rs::BOLT_VERSION_1` | v1-only today (the handshake declines anything else); v4 / v5 negotiation is tracked as a v0.5 follow-up. Neo4j 5.x drivers that won't accept v1 will reject the handshake on connect — see `MIGRATION-FROM-NEO4J.md` § "Bolt protocol coverage". |
| HTTP / `/v1/...` | URL prefix | Add `/v2/...` for breaking changes; `/v1` deprecated then removed across two minors |
| MCP (stdio + HTTP) | tool catalog at `crates/ogdb-cli/src/lib.rs::execute_mcp_request` (the `"tools/list"` arm) | stdio: `ogdb mcp --stdio`. HTTP: `POST /mcp/tools` (catalog) + `POST /mcp/invoke` (execute). SSE is **not** implemented — earlier drafts of this row claimed `stdio + sse`, but `grep -n 'mcp/sse\|mcp_sse' crates/ogdb-cli/src` returns nothing; the only `text/event-stream` writer in the binary is the unrelated query-streaming endpoint. |
| Prometheus `/metrics` | metric-name SemVer (additive only) | Removing a metric name is a breaking change |

---

## 5. What this means in practice

| Change | Bumps | Migration? |
|---|---|---|
| Fix a Cypher parser crash | Patch | No |
| Add a `ogdb serve --bind` flag | Patch | No |
| Add a new public Rust function in `ogdb-core` | Minor | No |
| Change a `pub fn` signature in `ogdb-core` | Minor (pre-1.0) / Major (post-1.0) | Source change for dependents |
| Bump `META_FORMAT_VERSION` | Minor + migration | Yes — `ogdb migrate` runs on first open |
| Remove a CLI flag | Minor + prior-minor deprecation | No (just stop using it) |
| Change Bolt handshake | (out of band) — Bolt minor | Driver renegotiates |

---

## 6. Release-time enforcement

Every `v*` tag must:

1. Pass `scripts/check-benchmarks-version.sh` — workspace version matches `BENCHMARKS.md` headline (Finding 1).
2. Pass `scripts/test-crate-metadata.sh` — every publishable crate has the metadata `cargo publish` requires (Finding 7).
3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` — the v0.4.0 baseline fixture still opens (Finding 12, this document).
4. Land a `CHANGELOG.md` entry under the new version. Format-version bumps are explicitly enumerated.

Tag pushes that fail any of the above never reach the `release` GitHub Actions job.
