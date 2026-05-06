# Eval / Gate / Test Coverage Audit — 2026-05-06

**Scope.** Recursive staff-level audit of CI, gate scripts, meta-tests, and the
release-tests manifest on `origin/main` at HEAD `23e8327`. Worktree:
`/tmp/wt-audit-eval` (detached, read-only).

**Method.** Five parallel investigation agents covered dimensions A–E
(coverage, gates, meta-tests, release manifest, comparison). Numbers below
are post-correction: agent findings cross-checked against the actual repo
before being rolled up.

**Inventory snapshot.** 40 `scripts/check-*.sh` gates, 42 `scripts/test-check-*.sh`
meta-tests, 4 GitHub workflows (`ci.yml`, `release.yml`, `release-skill.yml`,
`verify-claims.yml`), 69 entries in `.claude/release-tests.yaml`, 24 CLI
subcommands, ~346 public items in the 41,297-line `crates/ogdb-core/src/lib.rs`.

---

## A. Coverage gaps — what's tested vs what's not

### A1. ogdb-core public functions without tests

The crate is one 41,297-line `lib.rs` with an embedded `#[cfg(test)] mod tests`
containing ~380 `#[test]` functions covering ~346 public items. Spot-check
of architecturally significant public APIs (OpenGraphDB, Transaction, Vector*,
Temporal*, Cypher*) found:

- `pub fn vector_search` (`crates/ogdb-core/src/lib.rs:12430`) — **UNTESTED**
  (no callsite inside the embedded test module).

The thoroughness ceiling here is the 41k-line monolith itself: a per-symbol
audit on a single file this large is the wrong tool — see Top-10 #5 (file-size
gate) for the structural fix.

### A2. CLI subcommands without e2e tests

24 subcommands declared in `crates/ogdb-cli/src/lib.rs`. Cross-referencing
both `crates/ogdb-cli/tests/*.rs` (19 files) and `crates/ogdb-e2e/tests/*.rs`
(1 file): **every CLI subcommand has at least 2 test references**. Trail
left by `8883833 test(cli): add e2e tests for 13 previously-uncovered
subcommands` is intact.

Caveat — quality-of-test, not presence-of-test:
- `query` (CLI form) is exercised mostly via HTTP-server tests, not via the
  bare `ogdb query <db> <cypher>` invocation; the readme-listing test only
  asserts the subcommand is documented. A dedicated CLI-form smoke is thin.
- `export` and `export-rdf` are exercised by RDF round-trip tests; no
  standalone "exit-zero on a real db" smoke.
- `schema` is only referenced in 2 test files — both peripheral.

These are coverage *thinness*, not absence.

### A3. HTTP / Bolt endpoints without smoke tests

- Bolt `MSG_PULL_ALL` (0x3F) — **UNTESTED**
- Bolt `MSG_ACK_FAILURE` (0x0E) — **UNTESTED**
- HTTP `POST /backup` — **UNTESTED**
- HTTP `GET /metrics` (detailed/extended endpoint distinct from Prometheus) —
  **UNTESTED** (only `/metrics` Prometheus surface is covered by
  `http_prometheus.rs`)
- HTTP `POST /schema/evolve` — **UNTESTED**
- HTTP `DELETE /indexes/*` — **UNTESTED**

### A4. Workflows declared vs invoked

| Workflow | Trigger | Status |
|---|---|---|
| `ci.yml` | push/PR all branches | runs every change |
| `release.yml` | release tag + manual | runs only on release |
| `release-skill.yml` | skill version tag + manual | runs only on skill release |
| `verify-claims.yml` | push to main + PR to main | runs on main |

No orphaned/scheduled-only workflows. All four are exercised. ✅

**Coverage gap totals:** 1 pub-fn, 0 CLI commands (3 thin), 6 endpoints,
0 workflows.

---

## B. Structural gate completeness

| # | Gate | Covers | Misses |
|---|---|---|---|
| 1 | **Token-leak (repo-wide)** | NOTHING — only `frontend/scripts/check-token-leaks.sh` exists, scoped to `frontend/src/`. | `crates/`, `scripts/`, `.claude/`, `documentation/`, `Dockerfile`, `*.yaml`, `*.json`, `crates/*/tests/`, `frontend/public/`. No `sk-`/`ghp_`/`AKIA…` patterns scanned outside the SPA. |
| 2 | **Sacred-blue** (`#5B9DFF`) | `*.ts`, `*.tsx`, `*.css`, `*.scss` in `frontend/src/` with allowlist. | `*.html` (incl. `index.html`, `index-app.html`, `index-marketing.html`), `frontend/public/` assets (og-card.png, SVG logos), CSS variables in `frontend/src/index.css` root. |
| 3 | **Frontend Node API surface** | `frontend/src/**/*.ts(x)` imports of `opengraphdb` + `@opengraphdb/mcp` validated against published `index.d.ts`. | No enumeration of `migration-snippets/` or recipe dirs (currently none exist — gate is dead-code-resilient since `966045d`). Indirect re-exports from intermediate packages not validated. |
| 4 | **`.claude-plugin/plugin.json`** | name (kebab-case), description, version, license, repository. Sibling `.mcp.json` JSON-parses. | `author`, `homepage`, `keywords`, `claude_min_version`, `skills` array shape, `commands` array shape, `hooks` array shape — none enforced. |
| 5 | **`marketplace.json`** | name (kebab-case, non-reserved), `owner.name`, non-empty `plugins[]` with `name` + `source`. | `icon`, `screenshots`, `license`, `repository`, `keywords`, `category`, `plugins[].source` URL-format validation — none enforced. |
| 6 | **Claude attribution** | NOTHING. No gate exists. | `git log --grep` for `🤖`, `Co-Authored-By: Claude`, `Generated with Claude`. No tracked-file scan for the same patterns in code/docs. |
| 7 | **Path-leak** (`check-public-doc-tmp-leak.sh`) | `/tmp/*.md` references in user-facing docs (README, CHANGELOG, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, `documentation/`, `docs/`). | `/Users/<name>` and `/home/<name>` patterns — **not scanned at all**. Frontend `*.tsx`/`*.ts`/`*.css`, `crates/*/src/`, `crates/*/tests/`, `Dockerfile`, `scripts/`, fixtures/snapshots. |
| 8 | **Version drift** | 3 independent gates: `check-npm-version.sh` (workspace ↔ `npm/cli/package.json`), `check-pypi-version.sh` (workspace ↔ `crates/ogdb-python/pyproject.toml`), `check-benchmarks-version.sh` (workspace ↔ BENCHMARKS.md). | **`check-npm-version.sh` is currently RED**: workspace=0.5.1, `npm/cli/package.json`=0.4.0. Also: no gate covers `.claude-plugin/plugin.json` version, no unified all-sources-must-match master gate. |

**Gate-completeness totals:** 8 gates audited; **2 gates entirely missing**
(repo-wide token-leak, claude-attribution); **6 gates with coverage holes**;
**1 gate currently failing on main** (npm version drift).

---

## C. Red-green meta-test discipline

### C1. Pairing

- 40 `check-*.sh` ↔ 42 `test-check-*.sh`. Every check has ≥1 paired meta-test.
- **2 orphan meta-tests** (extra meta-tests with no matching `check-*` name):
  - `test-check-install-demo-path-matches.sh` — points at the renamed
    `check-install-demo-path-matches-binary-default.sh`. **By design** (split
    coverage of a widened gate); not a bug.
  - `test-check-opengraphdb-path-coherence.sh` — same target, separate angle
    on `init_agent.rs` + skill bundle coherence. Also by design.

### C2. Pass+fail discipline

**6 meta-tests are pass-only** (run the gate against the live repo, expect
exit 0; no planted-fixture failure case):

- `test-check-benchmarks-version.sh`
- `test-check-contributing-coverage-claim.sh`
- `test-check-followup-target-not-current.sh`
- `test-check-install-demo-path-matches.sh` *(orphan)*
- `test-check-opengraphdb-path-coherence.sh` *(orphan)*
- `test-check-security-supported-version.sh`

The remaining 36 exercise both red and green paths via tmp fixtures.

### C3. `test-all-check-scripts-wired.sh`

**ENFORCES.** Iterates `scripts/check-*.sh`, asserts each is invoked from
`scripts/test.sh`, fails with a clean diagnostic if any check is unreferenced,
and explicitly rejects "meta-tests alone are sufficient" (since they only
cover fixtures, not the live repo).

### C4. CI invocation

`.github/workflows/ci.yml:64` runs `./scripts/test.sh`, which sequentially
invokes all 40 gates against the live repo and all 42 meta-tests against
fixtures, plus `test-all-check-scripts-wired.sh`. **Meta-tests run on every
push/PR.**

**Meta-test discipline totals:** 2 orphans (intentional), **6 pass-only**
(red path missing), 0 fail-only, CI-invoked: yes.

---

## D. Release-tests manifest

### D1. Shape and size

`.claude/release-tests.yaml` — **69 entries** across 44 unique task IDs.
Schema: `id, task, crate, test, function, command, purpose, added`.
Every entry has all required fields (no orphans, no nulls).

### D2. Coverage of the last 50 commits

50 `fix(*)` commits in the last 50-commit window. Manifest coverage:

| Bucket | Count |
|---|---|
| `fix(*)` with a runtime regression-guard manifest entry | **21** |
| `fix(*)` doc-only (landing copy, BENCHMARKS rewordings, install copy) — manifest entry not expected | **9** |
| **Coverage** | **21/30 = 70 %** of fixes with a runtime gate |

The 70 % figure is healthy: the missing 30 % are intentional doc-only fixes
where a regression test would be performative.

### D3. Sample-5 spot-check

Run on the read-only worktree (no build allowed):

| Manifest entry | Result |
|---|---|
| `install-sh-asset-url-template` (`bash scripts/test-install-detect-target.sh`) | **PASS** — 5/5 targets resolved correctly |
| `wcoj-cost-comparison-under-5s` | SKIP — needs `cargo build` |
| `write-perf-single-op-under-2ms` | SKIP — needs `cargo build` |
| `obsidian-graph-quality-e2e` | SKIP — needs `npm ci` |
| `cli-e2e-subcommands` | SKIP — needs `cargo build` |

1/5 directly runnable in a read-only worktree; 4/5 SKIP-needs-build is the
expected steady state since 5/5 are real Rust/Playwright tests, not shell
gates. None failed.

### D4. Hygiene

- ✅ No stale script references. ✅ All 69 IDs unique. ✅ No empty
  `purpose`/`command` fields.
- ⚠ ~14 "impl-…" task IDs are *feature-proof* tests (monolith-split,
  evaluator-dimensions) rather than fix-regression guards. Manifest header
  says "every test was added to fix a specific bug" — there is mission
  creep from the bootstrap intent. Not a blocker.

**Release-tests totals:** entries=69, fix-coverage=21/30, sample-pass=1/5
(skipped=4, failed=0).

---

## E. Comparison vs mature repos

### E1. neo4j/neo4j (Java/Maven) — they have, we don't

- **Maven Enforcer banned-imports rule** (`restrict-imports-enforcer-rule`)
  + `bannedDependencies` blocking, e.g., test-jar deps in compile scope.
  We have no clippy `disallowed_methods`/`disallowed_macros` config banning
  `unwrap()`, `panic!`, `dbg!`, `tokio::block_on` from production crates.
- **Error Prone + Spotless** with hundreds of bug-pattern checks per build.
  We run vanilla clippy with no curated banned-pattern set.
- **license-maven-plugin** enforces a license header on every source file
  + the dedicated `neo4j/licensing-maven-plugin` audits transitive licenses.
  We have no header gate and no transitive-license scan over our 8 surfaces
  (Rust workspace + Python + Node + Bolt + HTTP + CLI + frontend + MCP).
- **`dependencyConvergence` enforcer** — two transitive deps cannot pull
  conflicting versions of the same artifact. We have no equivalent
  "single-version-of-X" check across crates + Python + Node bindings.
- **Per-module test-presence enforcer** — a module with zero tests fails the
  build. Our 41k-line `lib.rs` has no per-module coverage / per-module
  test-presence gate.

### E2. anthropics/claude-code — they have, we don't

- **Path-scoped permission gate** (`non-write-users-check.yml`) auto-comments
  on PRs touching `.github/**` that add `allowed_non_write_users`. We don't
  scan workflow diffs for permission-escalation patterns.
- **Issue lifecycle automation suite** (`claude-issue-triage`,
  `claude-dedupe-issues`, `auto-close-duplicates`, `lock-closed-issues`,
  `log-issue-events`, `issue-lifecycle-comment`). We have zero issue
  automation.
- **Claude-as-reviewer workflow** (`claude.yml`) wired to `@claude` mentions
  on PRs/issues with action SHA-pinned. We don't run an LLM reviewer in CI.
- **Pinned third-party action SHAs** (e.g. `actions/checkout@11bd71...`,
  not `@v4`). Our 4 workflows pin only some by SHA — supply-chain
  hardening gap.
- **`sweep.yml`** auto-fix bot integration. We have none.

### E3. anthropics/anthropic-sdk-python — they have, we don't

- **Triple type-checker** in one `./scripts/lint`: `ruff` + `pyright` + `mypy`
  + smoke-import. Our Python bindings (`crates/ogdb-python/`) almost
  certainly run neither pyright nor mypy in CI.
- **`detect-breaking-changes.yml`** that diffs the PR base vs HEAD with a
  custom Python script and **checks out the base version of the script
  itself** so deleting the detector with the symbol can't bypass the gate.
  We have no public-API breaking-change detector for our Rust + Python +
  Node + HTTP + Bolt + MCP surfaces.
- **`environment: production-release` manual-approval gate** on PyPI
  publish. Our `release.yml` / `release-skill.yml` likely don't gate on a
  protected GitHub Environment.
- **Manual-rerun publish workflow** (`publish-pypi.yml workflow_dispatch`)
  for idempotent retry of failed publishes. We have no retry escape hatch.
- **Hermetic toolchain pinning** (`uv 0.10.2` exact, `uv sync --all-extras`).
  Our toolchain pinning across Rust/Node/Python/Bun is not uniformly
  workflow-pinned.

---

## Top 10 fix list

Ranked by impact-per-effort.

1. **Add a repo-wide token-leak gate** (`scripts/check-token-leaks.sh`,
   independent of the frontend one). Patterns: `sk-[A-Za-z0-9]{20,}`,
   `ghp_[A-Za-z0-9]{36}`, `AKIA[A-Z0-9]{16}`, `xoxb-`, `glpat-`,
   `-----BEGIN ` private-key headers. Scope: `crates/`, `scripts/`, `.claude/`,
   `.claude-plugin/`, `documentation/`, `Dockerfile`, `*.yaml`, `*.json`,
   `frontend/public/`, fixtures. Pair with `test-check-token-leaks.sh`
   (red+green). **~30 min**, prevents a class of incidents that no other
   gate catches today.

2. **Add a claude-attribution check** (`scripts/check-claude-attribution.sh`):
   `git log --all --grep -E '🤖|Co-Authored-By:.*[Cc]laude|Generated with Claude'`
   AND `git ls-files | xargs grep -lE '…'`. Per global CLAUDE.md, attribution
   must never appear in commits OR tracked files. **~20 min**, satisfies an
   explicit ship rule that's currently un-enforced.

3. **Fix the live npm-version drift** (`npm/cli/package.json` 0.4.0 ↔
   workspace 0.5.1) — the gate `check-npm-version.sh` is RED on `main`
   right now. Either bump npm/cli/package.json to 0.5.1 or document the
   intentional decoupling and relax the gate. **~10 min** to fix; this is
   embarrassing on a `git fetch && bash scripts/test.sh` cold run.

4. **Unify version drift into one master gate** that walks all version sources
   (Cargo workspace, `frontend/package.json`, `.claude-plugin/plugin.json`,
   `npm/*/package.json`, `bindings/*/Cargo.toml`, `crates/ogdb-python/pyproject.toml`)
   and asserts equality (or a documented allowlist of intentional decouplings).
   Replaces three independent gates that can each silently pass with each
   other red. **~1 h**.

5. **Add a file-size gate**: `scripts/check-file-size.sh` capping any single
   `*.rs` at, say, 8,000 lines (chosen well below the current 41,297-line
   `lib.rs` so the gate trips immediately and forces the inevitable split,
   but allows time-bounded growth elsewhere). Pair with a red-green
   meta-test using a synthetic 8,001-line fixture. **~30 min** to add the
   script; the actual `lib.rs` split is the real work but at least CI now
   tracks the debt instead of pretending it's not there.

6. **Backfill red-path coverage for the 6 pass-only meta-tests**
   (`test-check-benchmarks-version.sh`, `…contributing-coverage-claim`,
   `…followup-target-not-current`, `…install-demo-path-matches`,
   `…opengraphdb-path-coherence`, `…security-supported-version`). Each
   needs a planted-fixture fail case. **~10 min × 6 = 1 h** total.

7. **Public-API breaking-change detector** modeled on
   `anthropic-sdk-python/scripts/detect-breaking-changes.py`. Run
   `cargo public-api --diff` against base SHA; equivalent
   `pyright --outputjson` symbol diff for `crates/ogdb-python`; named-export
   diff for `npm/cli` (`tsc --emitDeclarationOnly` then diff the `.d.ts`).
   Critically, check out the base version of the detector script so deleting
   the detector + symbol in the same PR can't bypass it. **~3-4 h**, kills
   accidental SemVer breaks across all six public surfaces.

8. **Extend path-leak gate to `/Users/<name>` and `/home/<name>`**, and to
   `crates/`, `scripts/`, `frontend/src/`, `Dockerfile`. Today the gate
   only scans user-facing docs for `/tmp/*.md`. **~30 min**.

9. **Add Bolt + HTTP smoke tests for the 6 untested endpoints** (PULL_ALL,
   ACK_FAILURE, `POST /backup`, extended `/metrics`, `POST /schema/evolve`,
   `DELETE /indexes/*`). One smoke per endpoint; in `ogdb-bolt/tests/` and
   `ogdb-cli/tests/http_*.rs`. **~2-3 h**.

10. **Pin all third-party GitHub Actions to SHA** in
    `.github/workflows/{ci,release,release-skill,verify-claims}.yml` (today
    most are `@v4`-style). Gate the change with `scripts/check-action-pins.sh`
    that fails on any non-SHA `uses:` outside an allowlist. Add a
    `production-release` GitHub Environment with manual-approval reviewers
    on `release.yml` + `release-skill.yml`. **~1 h** total, supply-chain win.

---

## Reply-line totals

```
untested=7  (1 pub-fn + 0 CLI + 6 endpoints; CLI has 3 thin-not-absent)
missing_gates=8  (2 entirely missing + 6 coverage holes; 1 gate red on main)
missing_meta=6  (6 pass-only; 0 fail-only; 2 orphans intentional)
```
