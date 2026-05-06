# OpenGraphDB Stability Audit vs 2026 Peer Reference Repos

**Date:** 2026-05-06
**Branch:** `audit/stab-vs-peers-2026-05-06`
**Auditor:** Staff-engineer pass, fresh detached worktree at `origin/main` (HEAD `23e8327`)
**Scope:** Compare OpenGraphDB's project maturity (CI, tests, release pipeline, docs, install UX, architecture clarity) against five canonical 2026 reference repos and identify the highest-ROI leverage plays.

---

## A. Survey of Reference Repos

| Repo | Stars / Activity | Install paths | CI workflows / matrix | Test types visible | Release cadence | Doc structure |
|------|------------------|---------------|-----------------------|--------------------|-----------------|---------------|
| **anthropics/claude-code** | Active 2026 (611 commits visible) | `curl install.sh` + brew cask + ps1 + WinGet + npm (deprecated) — **5 paths** | `.github/` present, workflow files not public-readable | Not surfaced in README | Continuous (CHANGELOG-gated) | `code.claude.com/docs`, `plugins/README.md`, `CHANGELOG.md`, `SECURITY.md` |
| **openai/codex** | 80.3k stars, 6,207 commits, 764 releases (latest v0.128.0 Apr-30-2026) | npm + brew cask + GitHub release binaries — **3 paths** | `.github/` present (workflows not surfaced); Bazel + pnpm build | Not surfaced (Rust 96%, presumed unit + integration via Bazel) | Frequent (~daily / multi-per-week) | `developers.openai.com/codex`, `docs/contributing.md`, `docs/install.md`, README quickstart |
| **anthropics/anthropic-sdk-python** | Active (1,099 commits, 183 releases, latest v0.99.0 May-5-2026) | pip — **1 path** | release-please pipeline visible (`.release-please-manifest.json`), uv lockfiles | `/tests` dir present; types not labelled in README | High (183 releases) | `platform.claude.com/docs`, README + CONTRIBUTING + api.md + helpers.md + tools.md + CHANGELOG + SECURITY |
| **neo4j/neo4j-go-driver** | Mature, 98 releases (latest v6.0.0 Dec-4-2025) | `go get` × 4 major-version paths | Docker-based Neo4j integration; Go 1.24 MSRV | **Unit + integration + benchmark + Testkit (Python3 cross-driver acceptance) + stress** — 5 distinct types | Patch-rare; minor-tracked | Drivers manual + pkg.go.dev + migration guide + Bolt-tracing docs |
| **cozodb/cozo** | 19 releases (latest v0.7.6 Dec-2023) — closest peer (embedded Cypher-ish graph DB in Rust) | cargo + npm (`cozo-node`) + WASM + pip (`pycozo`) + Maven + CocoaPods + native binary + C/C++ FFI + Go/Clojure/Lisp/Smalltalk — **12 bindings** | Single `build.yml`; multi-platform matrix (linux x86/ARM, macOS x86/ARM, Windows) | None of unit/integration/e2e/fuzz/property/bench surfaced; perf-bench narrative only | Low (~quarterly pre-1.0; stalled since Dec-2023) | `docs.cozodb.org` + `docs.rs/cozo` + tutorial chapter |

### OpenGraphDB inventory (this repo, `origin/main` 23e8327)

- **CI:** 4 workflow files (`ci.yml` 381L, `release.yml` 412L, `release-skill.yml` 144L, `verify-claims.yml` 73L), 1010 LOC of CI total.
- **`ci.yml` jobs (6):** `quality` (rust fmt + clippy + deny + audit + structural lints + workspace tests + doctests + 80% coverage gate via `cargo-llvm-cov`), `frontend-quality` (lint + tsc + vitest + token-leak), `e2e` (Playwright chromium), `msrv` (cargo check at Rust 1.88.0), `semver` (`cargo-semver-checks`), `cross-platform-build` (matrix `macos-latest, windows-latest`).
- **`release.yml`:** 5-target matrix (linux x86_64/aarch64, mac x86_64/aarch64, windows x86_64) → GitHub Release tar.xz/zip + SHA256SUMS + crates.io publish + GHCR docker, gated by full `scripts/test.sh` before any publish.
- **Test inventory:** **1026 `#[test]` attributes** across 18 crates, 8 `proptest` references, 2 fuzz targets (`fuzz_cypher_parser`, `fuzz_wal_record_reader` in `crates/ogdb-fuzz/fuzz/fuzz_targets/`), 2 criterion benches (`rag_benchmark.rs`, `throughput_benches.rs`), `ogdb-tck/` and `ogdb-e2e/comprehensive_e2e.rs`. Frontend: Playwright e2e + vitest unit.
- **Release cadence:** 4 tagged releases in ~14 days (v0.3.0 04-23, v0.4.0 04-28, v0.5.0 05-04, v0.5.1 05-05).
- **Install paths:** `install.sh` (curl), npm (`@opengraphdb/cli` postinstall fetches binary), Claude Code plugin (`/plugin install opengraphdb@opengraphdb`), GHCR docker, crates.io, paste-prompt-into-Claude. **6 paths.**
- **Bindings:** C (`bindings/c/opengraphdb.h`), Go (`bindings/go/opengraphdb`), Python (`crates/ogdb-python`), Node (`crates/ogdb-node`), MCP server (`crates/ogdb-cli` serve).
- **Docs:** README + ARCHITECTURE.md (10K) + DESIGN.md (98K) + SPEC.md (27K) + IMPLEMENTATION-READY.md + CHANGELOG.md (86K, Keep-a-Changelog) + CONTRIBUTING + CODE_OF_CONDUCT + SECURITY + `documentation/{QUICKSTART,CLI,COOKBOOK,BENCHMARKS,MIGRATION-FROM-NEO4J,COMPATIBILITY,SECURITY-FOLLOWUPS,install}.md` + `documentation/recipes/` + `documentation/ai-integration/` + `documentation/evaluation-runs/` + `documentation/.research/`.
- **Distinguishing gates:** `verify-claims.yml` (run frontend e2e against documented landing-page claims; fail CI if any claim unverified), `release-skill.yml` (auto-package skill bundle on `skill-v*` tag), `scripts/check-benchmarks-version.sh` (BENCHMARKS.md version-vs-Cargo.toml drift), `scripts/check-install-demo-path-matches-binary-default.sh` (install script ↔ binary default-path drift), `scripts/check-security-supported-version.sh` (SECURITY.md ↔ Cargo.toml drift).
- **Total commits:** 755. **Release stage:** v0.5.1, pre-1.0.

---

## B. Gap Analysis

### B.1 Mature-repo gates we MISS

| Gate | Where peer has it | Our state | Severity |
|------|-------------------|-----------|----------|
| **Continuous fuzzing on CI** (cron-scheduled or oss-fuzz integration) | neo4j-go-driver (stress dir + testkit), industry standard | We have `crates/ogdb-fuzz/fuzz/fuzz_targets/` (2 targets) but NO workflow runs them — dormant infrastructure | **HIGH** — fuzz crate exists but never executes on CI |
| **release-please / conventional-commit auto-publish** | anthropic-sdk-python (`.release-please-manifest.json` visible) | Manual `git tag v*` → release.yml. CHANGELOG hand-curated. | MED — manual cadence is sustainable but fragile to one-person bus-factor |
| **TestKit-style cross-binding acceptance harness** | neo4j-go-driver (Python3 testkit drives every binding against same suite) | C, Go, Python, Node bindings each have isolated tests; no shared corpus run | MED — divergence risk: e.g. a query that succeeds via HTTP could fail via FFI silently |
| **Linux aarch64 in PR-time CI matrix** | cozo `build.yml` matrix includes ARM64 linux | We BUILD aarch64-linux on tag in `release.yml`, but `cross-platform-build` PR matrix is `macos-latest, windows-latest` only — aarch64-linux is never gated until release time | MED — silent breakage caught only by user post-tag |
| **Mutation testing** (`cargo-mutants` / `mutmut`) | Mature Rust projects often run nightly mutation gates | Not present | LOW |
| **Continuous benchmark dashboard** (perf-CI-on-main, regression alarm) | criterion + bencher.dev or similar | We have `crates/ogdb-bench/` but no perf trend tracking | LOW-MED — `documentation/BENCHMARKS.md` is point-in-time |
| **SBOM publication on release** | Industry standard for supply-chain | `cargo-deny` + `cargo-audit` run, but no SBOM artifact | LOW |
| **Docker-image vulnerability scanning** (Trivy / Grype on GHCR push) | Mature container shippers | We push to GHCR but no scan step | LOW |

### B.2 Mature-repo doc patterns we MISS

| Pattern | Peer | Our state |
|---------|------|-----------|
| **Hosted docs site** (mdbook / Docusaurus / vitepress) | cozo `docs.cozodb.org`, claude-code `code.claude.com/docs`, anthropic-sdk-python `platform.claude.com/docs` | All docs are markdown in-repo. No rendered site at `opengraphdb.dev`/similar |
| **Per-version frozen docs** | Most mature DBs maintain `/docs/v0.5/`, `/docs/v0.4/` snapshots | Single trunk; readers on old binaries see drift |
| **API reference auto-generated** (rustdoc on docs.rs is automatic — but we don't link to it from README) | docs.rs/cozo, pkg.go.dev/neo4j-go-driver | crates.io publish exists; docs.rs link not surfaced in README |
| **Migration guide formatted as runnable Cypher diff** | (we already have MIGRATION-FROM-NEO4J.md) | ✅ we DO have this — actually **ahead** of peers; moved to B.3 |

### B.3 Install / distribution paths we MISS

| Path | Peer with it | Effort to add |
|------|--------------|---------------|
| **Homebrew tap / cask** | claude-code (`brew install --cask claude-code`), codex (`brew install --cask codex`) | LOW — formula in `homebrew-tap` repo, points at our existing release tarballs |
| **WinGet manifest** | claude-code (`winget install Anthropic.ClaudeCode`) | LOW — yaml submission to microsoft/winget-pkgs |
| **PyPI wheel** (auto-publish from CI) | cozo `pycozo`, anthropic-sdk-python | MED — `crates/ogdb-python` exists but no PyPI release pipeline |
| **Maven / JVM binding** | cozo (`io.github.cozodb`) | HIGH — no JNI binding exists today |
| **iOS/Android binding** (CocoaPods / Maven) | cozo CocoaPods | HIGH — out-of-scope for v0.x |
| **APT/RPM packages** | not done by claude-code/codex either; nice-to-have | MED |

### B.4 Where we're AHEAD of peers

| Capability | Why it matters | Closest peer comparison |
|------------|----------------|-------------------------|
| **`verify-claims.yml` — landing-page claims gated by E2E** | Marketing copy can't drift from product reality; every "we support X" is wired to a Playwright spec listed in `.claude/release-tests.yaml` | None of the 5 surveyed peers do this. **Novel.** |
| **Honesty publishing in BENCHMARKS.md** | `documentation/BENCHMARKS.md` § 2.2 publishes verified `❌ LOSS` rows vs Neo4j Community 5.x at the 10k tier (bulk ingest 23× slower; 2-hop chained traversal LOSS at p50/p95/p99) alongside the wins | cozo's docs cite their own perf wins; never publishes head-to-head losses. claude-code/codex don't compete on perf so n/a. **Differentiated.** |
| **Cross-doc honesty gates** (`check-benchmarks-version.sh`, `check-install-demo-path-matches-binary-default.sh`, `check-security-supported-version.sh`) | Documentation drift is structurally prevented, not just review-caught | None of the 5 surveyed peers expose drift gates of this granularity |
| **Plugin-format release** (`release-skill.yml` produces `.skill` bundle + tarball on `skill-v*` tag) | First-class agent-tool integration: `/plugin install opengraphdb@opengraphdb` works inside an active Claude Code session | Closest analog: codex/claude-code distribute themselves but don't ship companion agent-bundle artifacts |
| **18-crate workspace decomposition** with named DESIGN.md crate map | A reader can isolate `ogdb-bolt` (protocol) from `ogdb-temporal` (bitemporal) from `ogdb-tck` (compliance) by directory | cozo is a single crate; neo4j-go-driver is multi-package but less granular |
| **MSRV pinned in CI** (`dtolnay/rust-toolchain@1.88.0` in every job) + dual-pin in `rust-toolchain.toml` + `Cargo.toml`'s `rust-version` | Eliminates "works on my machine" rustc drift | cozo doesn't pin MSRV in CI |
| **Architecture+Design+Spec separation** (ARCHITECTURE.md 10K + DESIGN.md 98K + SPEC.md 27K) | Reader can pick depth; SPEC is interface-level, DESIGN is internals, ARCHITECTURE is operator-facing | All 5 peers have ≤1 internals doc |
| **Coverage gate at 80% / ≤5000 uncovered lines** enforced in CI | Coverage isn't a vanity metric; it's a merge gate | None of the 5 surveyed peers gate coverage at PR-time visibly |
| **Semver-checks gate** (`cargo-semver-checks` on every PR) | Breaking changes flagged before tag, not after | Mature Rust projects do this; cozo doesn't |
| **Keep-a-Changelog discipline + `[Unreleased]` bullet enforcement** (AGENTS.md:13 rule, `scripts/workflow-check.sh` Layer-1 gate) | Every merged change documents itself | claude-code, anthropic-sdk-python use it; cozo doesn't |

---

## C. Stability Verdict (1–5 scale)

| Dimension | Score | Justification | Reference comparison |
|-----------|------:|---------------|----------------------|
| **CI breadth** | **4** | 4 workflows × 6 PR jobs (quality, frontend-quality, e2e, msrv, semver, cross-platform-build) + tag-time release.yml + verify-claims gate. Missing: aarch64-linux in PR matrix, fuzz-on-cron. | Ahead of cozo (single `build.yml`); behind codex (Bazel-driven, presumably broader matrix at 6207-commit scale). |
| **Test coverage** | **4** | 1026 `#[test]`s + 8 proptests + 2 fuzz targets + criterion benches + Playwright e2e + vitest + ogdb-tck + ogdb-e2e + 80% line-coverage gate. Missing: continuous fuzz, mutation tests, cross-binding TestKit. | Behind neo4j-go-driver (Testkit + stress dir); ahead of cozo (no fuzz/property surfaced). |
| **Release pipeline** | **4** | 5-target binary matrix + crates.io publish + GHCR docker + skill-bundle + SHA256 checksums + `install.sh` shipped as release asset + tests-gate-before-publish. Missing: release-please conventional-commit automation, SBOM, Trivy scan. | Behind anthropic-sdk-python (release-please); ahead of cozo (no docker/npm pipeline visible in build.yml). |
| **Docs honesty** | **5** | Verify-claims CI gate + BENCHMARKS publishing `❌ LOSS` rows + 3 structural drift gates (benchmarks/install-demo-path/security-supported-version) + `[Unreleased]` enforcement. Reader can trust every published claim is mechanically backed. | Ahead of all 5 peers. None publish losses or gate doc-vs-code drift this rigorously. |
| **Install UX** | **4** | 6 install paths (curl install.sh, npm, plugin, paste-prompt, crates, docker) + `ogdb init --agent` for AI wiring + `ogdb demo` MovieLens seed in 5 minutes. Missing: brew, winget, PyPI wheel. | Ahead of anthropic-sdk-python (pip-only) for variety; behind cozo (12 bindings) and claude-code (brew + winget); the agent paste-prompt path is unique to us. |
| **Architecture clarity** | **5** | DESIGN.md (98K crate map) + ARCHITECTURE.md (storage/transaction/recovery) + SPEC.md (27K interface) + 18 named crates with README-per-crate where they matter. A new contributor can locate any subsystem in <5 minutes. | Ahead of all 5 peers; closest is neo4j-go-driver but it's interface-only, not internals-deep. |

**Average: (4+4+4+5+4+5)/6 = 4.33 → 4.3 / 5.0**

Translation: **"works AND is sustainable as a one-maintainer-headcount project."** The remaining gap to a 5.0 across the board is mostly distribution breadth (brew/winget/PyPI) and continuous-fuzz/cross-binding testkit — all *additive*, not corrective. The repo is structurally honest; the foundation is sound.

---

## D. Recommended Next 5 Leverage Plays (Ordered by ROI: effort ÷ impact)

### 1. Add `aarch64-unknown-linux-gnu` to the PR-time `cross-platform-build` matrix
**Effort:** TINY (one-line YAML change; cross compilation is already configured in `release.yml`)
**Impact:** HIGH for risk reduction. Today, an aarch64-linux regression is caught only when a tag is cut and a user `curl`s the binary. Closes the largest "tagged-release-fails-on-aarch64-Linux" embarrassment vector for ~15 minutes of CI time per PR.
**Where:** `.github/workflows/ci.yml` `cross-platform-build` job — add a `linux-aarch64` matrix entry using `cross` (already a dependency in `release.yml`).
**Why first:** cheapest, biggest single-fix risk drop. Pure leverage.

### 2. Schedule continuous fuzzing on a nightly cron
**Effort:** SMALL. `crates/ogdb-fuzz/fuzz/fuzz_targets/{fuzz_cypher_parser,fuzz_wal_record_reader}.rs` already exist and compile. Just add a `fuzz.yml` cron workflow that runs `cargo +nightly fuzz run <target> -- -max_total_time=600` (10 min/target/night) and uploads any corpus crash to a GitHub issue.
**Impact:** HIGH for correctness. We've shipped fuzz infrastructure that has never executed on shared infra. WAL fuzzing in particular guards data-integrity invariants — the kind of bug that destroys customer trust if it slips. ROI of "infrastructure already paid for" is hard to beat.
**Why second:** the crate exists; the wiring is the only missing piece.

### 3. Migrate release flow to `release-please` (auto-tag + auto-CHANGELOG from conventional commits)
**Effort:** MEDIUM. ~1 PR to add `.release-please-manifest.json` + `release-please-config.json` + a `release-please.yml` workflow that opens a PR per release, auto-bumping `Cargo.toml` and `CHANGELOG.md`. Existing `release.yml` keeps firing on the resulting `v*` tag.
**Impact:** HIGH for sustainability. Today, every release is a manual ritual: hand-curate `CHANGELOG.md`, manually bump `package.json` + `Cargo.toml` + `.claude-plugin/plugin.json`, hand-tag. With 4 releases in 14 days, the bus-factor and forgot-to-bump-something risk compounds. release-please collapses it to "merge the release PR".
**Reference:** anthropic-sdk-python uses this; their 183 releases on 1099 commits is partly *because* the friction is zero.
**Why third:** higher effort than #1/#2 but pays back every release forever.

### 4. Ship a Homebrew tap + WinGet manifest pointing at existing release tarballs
**Effort:** MEDIUM. Create `asheshgoplani/homebrew-opengraphdb` repo with a single Formula file referencing our existing `release.yml` tar.xz + SHA256SUMS. WinGet manifest is yaml + a PR to `microsoft/winget-pkgs`.
**Impact:** HIGH for adoption. The "I want to `brew install` it" funnel is a real adoption friction; many would-be users won't `curl … | sh`. Both claude-code and codex already cover both paths — this is table stakes for any modern CLI distribution. No release-pipeline changes needed; the tarballs already exist.
**Why fourth:** higher effort than #1–#3 but unlocks the largest non-shell-paste user segment.

### 5. Build a TestKit-style cross-binding acceptance harness
**Effort:** HIGH. Define a YAML test corpus (cypher query + expected result shape) and a Python harness that runs the corpus through each of: HTTP API, C FFI (`bindings/c`), Go binding (`bindings/go`), Python binding (`crates/ogdb-python`), Node binding (`crates/ogdb-node`). Wire as a nightly job. Tag failures back to which surface diverged.
**Impact:** MEDIUM-HIGH for correctness, HIGH for confidence-in-claims. Today each binding tests itself in isolation; a query that returns `[{a:1}]` over HTTP could return `[{"a":1}]` over Node and `{a:1}` over C, and we wouldn't know until a user files. As the binding count grows past 4, this harness becomes the only way to keep them in lockstep.
**Reference:** neo4j-go-driver's Testkit drives every Neo4j driver (Python, Java, JS, Go, .NET, Rust) against the same Bolt acceptance suite. That's how Neo4j keeps 6 drivers behaviourally identical.
**Why last:** highest effort; payoff scales with binding count, which is currently 5 — high enough to justify but not yet urgent.

---

## Summary

OpenGraphDB is structurally a **4.3/5 mature project at v0.5.1**, distinguished from peers most strongly by **doc honesty** (verify-claims gate, published `❌ LOSS` rows in BENCHMARKS, structural drift gates) and **architecture clarity** (DESIGN/ARCHITECTURE/SPEC separation, 18-crate workspace map). The gaps that remain are all *additive distribution and CI breadth* — not corrective foundation work. The five plays above, in order, would move the project from 4.3 to a defensible 4.7 with bounded effort, and the first two cost essentially nothing because the underlying infrastructure already exists.
