# EVAL-DOCS-COMPLETENESS-CYCLE20

- **Workspace HEAD:** `fb0ec7a` (origin/main, post cycle-19's two-commit fix-set: `ae7ebb5` migration-guide e2e selectors made case-insensitive to track cycle-18 F02's bold "Scale-mismatched" sub-heading restructure; `fb0ec7a` `~/.opengraphdb` → `~/.ogdb` sweep across `init_agent.rs` + skill bundle scripts + skill bundle references + widened `check-install-demo-path-matches-binary-default.sh`).
- **Worktree:** a fresh detached worktree off `origin/main`.
- **Reviewer scope:** the cycle-20 prompt frames this as the first clean round after cycle-19's closure of cycle-19 F01/F02/F03 (the three HIGHs cycle-18's narrow path-bump introduced). Specifically:
  1. Confirm cycle-19's three HIGHs are mechanically closed by `fb0ec7a` and that the widened gate enforces the closure red-green.
  2. Audit the two cycle-19 commits (`ae7ebb5`, `fb0ec7a`) for new drift introduced by the cycle-19 fix itself — including whether the widened gate's scope is sufficient for the contract it implies.
  3. Search for residual `~/.opengraphdb` references that the widened gate might still miss (the prompt explicitly calls this out).
  4. Re-status cycle-19's MEDIUMs (F05–F08) and LOWs (F04, F09, F10) — none of them are touched by either cycle-19 commit.
  5. Check downstream surfaces of the path sweep (CHANGELOG, npm/cli docs, version stamps) per prompt.
- **Prior cycle report:** `git show origin/eval/c19-docs-6c17c3d:documentation/EVAL-DOCS-COMPLETENESS-CYCLE19.md` — 0B + 3H + 4M + 3L. The 3 HIGHs are mechanically closed (verified below); 4 MEDIUMs + 3 LOWs unchanged because cycle-19 only addressed the HIGHs.

## Methodology

Every shipped gate passes:

- `bash scripts/check-public-doc-tmp-leak.sh` → 0 hits.
- `bash scripts/check-design-vs-impl.sh` → 0 hits.
- `bash scripts/workflow-check.sh` → exit 0.
- `bash scripts/check-changelog-tags.sh` → 0 hits.
- `bash scripts/check-benchmarks-version.sh` → "ok (0.5.1; headline + § 2 column header agree)".
- `bash scripts/check-followup-target-not-current.sh` → "ok (workspace=0.5.1; all 'vX.Y follow-up' tokens name a future minor)".
- `bash scripts/check-changelog-paths.sh` → "ok (13 unique doc paths checked; all resolve or whitelisted)".
- `bash scripts/check-doc-anchors.sh` → 0 hits.
- `bash scripts/check-doc-rust-blocks.sh` → "OK — all extracted runnable blocks compile".
- `bash scripts/check-shipped-doc-coverage.sh` → "OK".
- `bash scripts/check-binding-readmes.sh` → "ok".
- `bash scripts/check-skills-copilot-removed.sh` → 0 hits.
- `bash scripts/test-all-check-scripts-wired.sh` → "ok (every scripts/check-*.sh is referenced from scripts/test.sh)".
- `bash scripts/check-install-demo-path-matches-binary-default.sh` (cycle-18 + cycle-19-widened) → "ok (install.sh OGDB_HOME=$HOME/.ogdb == binary default $HOME/.ogdb/demo.ogdb; init_agent.rs + skill bundle clean)".
- `bash scripts/check-benchmarks-vocabulary-mirror.sh` (cycle-18) → 0 hits.
- `bash scripts/check-init-agent-syntax.sh` (cycle-18) → 0 hits.
- `bash scripts/test-check-opengraphdb-path-coherence.sh` (cycle-19 new red-green meta-test) → 7/7 cases pass.

Cycle-19 closure verification:

- **C19 F01 (`init_agent.rs::resolve_db_path` + log dir + aider skill default at `~/.opengraphdb`)**: `fb0ec7a` swept all four hits — `crates/ogdb-cli/src/init_agent.rs:35` (doc-comment), `:234` (`resolve_db_path` default), `:274` (`start_http_server` log dir), `:454` (`install_aider_skill` destination) — `~/.opengraphdb` → `~/.ogdb` everywhere. Confirmed via `git grep -n '\.opengraphdb' crates/ogdb-cli/src/init_agent.rs` → 0 hits. **Closed.**
- **C19 F02 (skill bundle wrapper scripts default `OGDB_DB=~/.opengraphdb/demo.ogdb`)**: `fb0ec7a` swept `skills/opengraphdb/scripts/ogdb-serve-http.sh:6,9,11` (the comment, `OGDB_DB` default, and `OGDB_LOG_DIR` default) and `skills/opengraphdb/scripts/ogdb-mcp-stdio.sh:9` (`OGDB_DB` default). `git grep -n '\.opengraphdb' skills/opengraphdb/scripts/` → 0 hits. **Closed.**
- **C19 F03 (skill bundle reference docs reference `~/.opengraphdb/demo.ogdb`)**: `fb0ec7a` swept all 9 hits (`skills/opengraphdb/references/debugging.md:16,23,28,54,60` + `skills/opengraphdb/references/common-recipes.md:31,74,86,109`) to `~/.ogdb/demo.ogdb`. Two legitimate occurrences remain (both exempted by the gate): `mcp.opengraphdb.<tool>` API-namespace calls (8 hits across both files) and the `mcpServers.opengraphdb` jq config-key example (`debugging.md:88`). **Closed.**
- **Widened gate verification**: `scripts/check-install-demo-path-matches-binary-default.sh:71-89` (cycle-19 widening) now scans `init_agent.rs` + `skills/opengraphdb/scripts` + `skills/opengraphdb/references` for any `\.opengraphdb` token, with two exemptions (`mcp\.opengraphdb\.[a-zA-Z_]` API namespace + `mcpServers\.opengraphdb` jq key). New red-green meta-test `scripts/test-check-opengraphdb-path-coherence.sh` (7 cases) is wired into `scripts/test.sh:113-117` and asserts: clean tree → pass; planted stale init_agent.rs hit → fail; planted stale skill script hit → fail; planted stale skill reference hit → fail; both legitimate exemption forms → pass; live repo root → pass. All 7 cases pass.

Audit of the two cycle-19 commits for new drift:

- `ae7ebb5` (`frontend/e2e/migration-guide-snippets.spec.ts:249-258`): the "scale-mismatched" honesty-marker assertion was made case-insensitive (`body.toLowerCase()`) so cycle-18 F02's promotion of "Scale-mismatched (mini fixtures)." to a bold sub-heading at `documentation/MIGRATION-FROM-NEO4J.md:166` doesn't break the runnable-snippet assertion. Verified the assertion content matches reality: L150 carries "256 nodes/s" and L160-166 carries the bold "Scale-mismatched" sub-heading; the case-insensitive form catches both lowercase legacy prose and the new uppercase form. **No drift.**
- `fb0ec7a` (path sweep + widened gate): three concerns I checked.
  - **Concern 1 — gate scope vs `include_dir!` actual scope.** The binary's `include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb")` (`init_agent.rs:32`) bakes in **the entire `skills/opengraphdb/` recursively**, but the cycle-19 widened gate's `TARGETS` array (`scripts/check-install-demo-path-matches-binary-default.sh:81-84`) enumerates only three sub-paths (`init_agent.rs` + `skills/opengraphdb/scripts` + `skills/opengraphdb/references`). The four out-of-scope files inside `skills/opengraphdb/` — `SKILL.md`, `eval/cases.yaml`, `agents/` (none today), and any future subdir — are *currently clean* (verified zero `\.opengraphdb` hits in those four), but the gate's contract is narrower than the deposit surface. See F01.
  - **Concern 2 — CHANGELOG narrative completeness.** `CHANGELOG.md:10` (the [Unreleased] bullet for cycle-18 F01 install.sh / `handle_demo` fix) describes the path-bump as covering "install.sh + lib.rs + README + QUICKSTART". That description was accurate at cycle-18 close but has since been overtaken — cycle-19's `fb0ec7a` extended the sweep to `init_agent.rs` (4 hits) + skill bundle scripts (4 hits including `OGDB_LOG_DIR`) + skill bundle references (9 hits), a 4× expansion in surface coverage. Neither cycle-19 commit (`ae7ebb5`, `fb0ec7a`) updated `CHANGELOG.md`. The existing `scripts/workflow-check.sh` Layer-2 is `feat(` only and skips `fix(` commits, so both cycle-19 commits slipped through silently. The convention established by cycles 15 + 18 is that fix-set commits add a [Unreleased] bullet (see L11 + L14 + L16 examples). See F02.
  - **Concern 3 — residual project-wide `~/.opengraphdb` references.** I ran `git grep -nE '\.opengraphdb' -- ':!documentation/EVAL-*' ':!target/' ':!node_modules/'` excluding the two legitimate exemptions (`mcp.opengraphdb.<tool>` API namespace and `mcpServers.opengraphdb` jq key) and the three intentional historical references in gate scripts themselves (`scripts/check-install-demo-path-matches-binary-default.sh` comments + `scripts/test-check-install-demo-path-matches.sh` red-green test cases + `scripts/test-check-opengraphdb-path-coherence.sh` red-green test cases + `scripts/test.sh:111` comment). What remains:
    - `DESIGN.md:2092` + `:2107` — two `~/.opengraphdb/config.toml` references in §34 "Configuration System" prose about a never-shipped feature (cycle-19 F04 carry-forward, see F03).
    - `CHANGELOG.md:10` — historical reference to cycle-18 fix's old path; legitimate Keep-a-Changelog usage. Not drift.
    - `frontend/src/stores/settings.ts:27` — `*.opengraphdb.dev` (a domain-wildcard, not a filesystem path). Not drift.

Then re-status the cycle-19 carry-forward MEDIUMs / LOWs:

- **C19 F05 (COMPATIBILITY.md:44 "Future releases add a v0.5.0 fixture beside it")** — fixture exists at `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs`; prose contradicts shipped state. Unchanged. See F05.
- **C19 F06 (COMPATIBILITY.md:94 § 6 release-time runbook lists only `upgrade_fixture_v0_4_0_opens_on_current`)** — Unchanged. See F06.
- **C19 F07 (COMPATIBILITY.md:3 doc stamp "active as of v0.4.0 · 2026-05-01")** — workspace is at 0.5.1; cycle-19 fixes landed; stamp untouched. Unchanged. See F04.
- **C19 F08 (SECURITY-FOLLOWUPS.md:26 "post-v0.5 task")** — `scripts/check-followup-target-not-current.sh` regex still catches only `vX.Y follow-up`; `post-vX.Y` slips through. Unchanged. See F07.
- **C19 F04 (DESIGN.md:2092+2107 stale `~/.opengraphdb/config.toml` references)** — fb0ec7a's narrow target scope deliberately excluded DESIGN.md. Unchanged. See F03.
- **C19 F09 (BENCHMARKS.md:33 deltas attribution "(full audit, cycle-15)" stale; cycle-16 f72f7cd extended scope)** — Unchanged. See F08.
- **C19 F10 (frontend/e2e/qa-followups.spec.ts:3 /tmp/wt-frontend-qa scratch path leak)** — Unchanged. See F09.

## Findings

### F01 — MEDIUM — `scripts/check-install-demo-path-matches-binary-default.sh:81-84` widened-gate `TARGETS` array enumerates three explicit sub-paths but `include_dir!` (`crates/ogdb-cli/src/init_agent.rs:32`) bakes in the *entire* `skills/opengraphdb/` directory recursively — gate contract is narrower than the deposit surface

- **Severity:** MEDIUM. **Latent gap introduced by cycle-19 `fb0ec7a`.** The widened gate at:
  ```bash
  TARGETS=(
    "$ROOT/crates/ogdb-cli/src/init_agent.rs"
    "$ROOT/skills/opengraphdb/scripts"
    "$ROOT/skills/opengraphdb/references"
  )
  ```
  enumerates only the three sub-trees that hosted the cycle-19 F01/F02/F03 hits. But `crates/ogdb-cli/src/init_agent.rs:32`'s `static SKILL_BUNDLE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb")` bakes in **every file** under `skills/opengraphdb/` at compile time and `write_skill_bundle` deposits the whole tree onto user systems on `ogdb init --agent`. The four files outside the three enumerated sub-paths are:

  - `skills/opengraphdb/SKILL.md` — the skill's primary entry point, the file the agent reads first.
  - `skills/opengraphdb/eval/cases.yaml` — the skill-eval case bundle.
  - `skills/opengraphdb/agents/` — does not exist today, but a future subdir would also slip through.
  - `skills/opengraphdb/` (top-level files added in the future).

  All four are *currently clean* of `\.opengraphdb` filesystem-path tokens (verified via `grep -nE '\.opengraphdb' skills/opengraphdb/SKILL.md skills/opengraphdb/eval/cases.yaml` → 0 hits). But the cycle-19 F01-F03 pattern was exactly "partial-sweep with scope-too-narrow gate" — the cycle-18 F01 closure shipped `check-install-demo-path-matches-binary-default.sh` whose original scope (install.sh ↔ `lib.rs::default_demo_db_path`) was too narrow and missed init_agent.rs + the skill bundle. Cycle-19 widened the gate to cover the surfaces *that exhibited drift*, but stopped one step short of pinning the gate's scope to the binary's actual deposit surface.

- **Verified:**
  ```
  $ sed -n '81,84p' /tmp/wt-c20-docs/scripts/check-install-demo-path-matches-binary-default.sh
  TARGETS=(
    "$ROOT/crates/ogdb-cli/src/init_agent.rs"
    "$ROOT/skills/opengraphdb/scripts"
    "$ROOT/skills/opengraphdb/references"
  )
  $ grep -n include_dir crates/ogdb-cli/src/init_agent.rs
  29:use include_dir::{include_dir, Dir};
  32:static SKILL_BUNDLE: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/../../skills/opengraphdb");
  $ find skills/opengraphdb -type f | grep -v '/scripts/' | grep -v '/references/'
  skills/opengraphdb/SKILL.md
  skills/opengraphdb/eval/cases.yaml
  ```
  → four files in the deposit surface are not in the gate scope.

- **Patch sketch:** widen `TARGETS` to mirror `include_dir!` exactly:
  ```diff
  --- a/scripts/check-install-demo-path-matches-binary-default.sh
  +++ b/scripts/check-install-demo-path-matches-binary-default.sh
  @@ -81,4 +81,3 @@
   TARGETS=(
     "$ROOT/crates/ogdb-cli/src/init_agent.rs"
  -  "$ROOT/skills/opengraphdb/scripts"
  -  "$ROOT/skills/opengraphdb/references"
  +  "$ROOT/skills/opengraphdb"
   )
  ```

  Then add cases 8–9 to `scripts/test-check-opengraphdb-path-coherence.sh` planting stale `\.opengraphdb` tokens in `skills/opengraphdb/SKILL.md` and `skills/opengraphdb/eval/cases.yaml` and asserting both red. This pins the gate's contract to the actual `include_dir!` deposit surface, so any future contributor adding a `\.opengraphdb` reference anywhere under `skills/opengraphdb/` (not just scripts/ + references/) gets caught.

  Optionally, parse `init_agent.rs:32`'s `include_dir!` literal at gate-runtime and use the parsed path as the second target — making the gate self-tracking against any future relocation of the skill bundle. That's the rigorous variant; the simple TARGETS widening above is enough.

---

### F02 — MEDIUM — `CHANGELOG.md:10` [Unreleased] bullet describes the cycle-18 path-bump as covering "install.sh + lib.rs + README + QUICKSTART" — cycle-19 `fb0ec7a` extended the sweep 4× (init_agent.rs + skill bundle scripts + skill bundle references) but neither cycle-19 commit updated CHANGELOG.md; existing `scripts/workflow-check.sh` Layer-2 is `feat(` only and didn't gate it

- **Severity:** MEDIUM. **Process drift introduced by cycle-19 `fb0ec7a` + `ae7ebb5`.** `CHANGELOG.md:10` (the cycle-18 F01 [Unreleased] entry) reads:

  > install.sh wrote the empty database to `~/.opengraphdb/demo.ogdb` while `ogdb demo`'s default path is `~/.ogdb/demo.ogdb` … README.md L39+L52 + documentation/QUICKSTART.md L29+L43+L51 path references swept. New `scripts/check-install-demo-path-matches-binary-default.sh` structural gate …

  This was accurate at cycle-18 close. But `fb0ec7a` (cycle-19) extended the sweep to:
  - `crates/ogdb-cli/src/init_agent.rs:35,234,274,454` (4 hits)
  - `skills/opengraphdb/scripts/{ogdb-serve-http.sh,ogdb-mcp-stdio.sh}` (4 hits)
  - `skills/opengraphdb/references/{debugging.md,common-recipes.md}` (9 hits)

  …and widened the gate from "install.sh ↔ lib.rs" to "install.sh ↔ lib.rs + init_agent.rs + skill bundle scripts + skill bundle references" with a new red-green meta-test (`scripts/test-check-opengraphdb-path-coherence.sh`). Neither cycle-19 commit (`ae7ebb5`, `fb0ec7a`) updated `CHANGELOG.md`.

  The release-notes reader of v0.5.2 will see the L10 bullet and conclude the sweep covered 4 files; a `git grep` will show 17 hits across 7 files were swept. The CHANGELOG narrative is now factually understated against the shipped state.

  Why the gate didn't catch it: `scripts/workflow-check.sh:60-90` Layer-2 enumerates `feat(` commits only (the docstring at line 13 is explicit: "Every `feat(` commit since the latest released `## [X.Y.Z]` heading must map to at least one bullet"). Both cycle-19 commits use `fix(` prefixes, so neither is enumerated. Layer-1 only requires ≥1 bullet under [Unreleased], which is already satisfied by the cycle-15 entries. Cycles 15 and 18 added [Unreleased] bullets *voluntarily* (the convention isn't gate-enforced for `fix(`); cycle-19 broke from that convention.

- **Verified:**
  ```
  $ git log --oneline -5 -- CHANGELOG.md
  6c17c3d fix(install,demo): align install.sh path with binary default + ogdb demo re-seeds empty init files
  91ee552 fix(install,readme,changelog): correct demo seed claim — ogdb demo loads MovieLens only, not movies+social+fraud
  …
  $ git log --oneline -3 fb0ec7a
  fb0ec7a fix(paths): complete ~/.opengraphdb → ~/.ogdb sweep across init_agent.rs + skill bundle + widen gate
  ae7ebb5 fix(migration-spec): update e2e selectors to match cycle-18 F02 wins-section restructure
  6c17c3d fix(install,demo): align install.sh path with binary default + ogdb demo re-seeds empty init files
  ```
  → fb0ec7a and ae7ebb5 do not appear in CHANGELOG.md history; the latest CHANGELOG-touching commit is 6c17c3d (cycle-18).

- **Patch sketch:** append two entries (or merge into the existing L10 bullet):
  ```diff
   ## [Unreleased]

  +- `crates/ogdb-cli/src/init_agent.rs` + `skills/opengraphdb/scripts/{ogdb-serve-http.sh,ogdb-mcp-stdio.sh}` + `skills/opengraphdb/references/{debugging.md,common-recipes.md}` (cycle-19 docs eval F01/F02/F03, commit `fb0ec7a`) — completed the cycle-18 `~/.opengraphdb` → `~/.ogdb` path sweep across the three binary-deposit surfaces cycle-18's narrow scope had left behind: 4 hits in `init_agent.rs` (the standalone-`init --agent` workflow's default DB path / HTTP-server log dir / aider skill destination), 4 hits in skill-bundle wrapper scripts (deposited verbatim via `include_dir!`), 9 hits in skill-bundle reference docs (read by the agent for "where is the demo database?" answers). `scripts/check-install-demo-path-matches-binary-default.sh` widened to scan `init_agent.rs` + `skills/opengraphdb/scripts/` + `skills/opengraphdb/references/` for stale `\.opengraphdb` tokens with `mcp.opengraphdb.<tool>` and `mcpServers.opengraphdb` exemptions; new red-green meta-test `scripts/test-check-opengraphdb-path-coherence.sh` (7 cases) wired into `scripts/test.sh`.
  +- `frontend/e2e/migration-guide-snippets.spec.ts` (cycle-18 docs eval F02 follow-up, commit `ae7ebb5`) — case-insensitive matching for the "scale-mismatched" honesty-marker so cycle-18 F02's promotion of the term to a bold sub-heading (`Scale-mismatched (mini fixtures).` at `documentation/MIGRATION-FROM-NEO4J.md:166`, capitalised S) doesn't break the runnable-snippet assertion that originally targeted the lowercase prose form.

   - `scripts/install.sh` + `crates/ogdb-cli/src/lib.rs::handle_demo` (cycle-18 docs eval F01) — install.sh banner promised "run `ogdb demo` to load MovieLens" but the post-install workflow could not deliver: install.sh wrote the empty database to `~/.opengraphdb/demo.ogdb` while `ogdb demo`'s default path is `~/.ogdb/demo.ogdb`, and `ogdb demo <existing-path>` short-circuited the seed when the file already existed. …
  ```

  Optional gate strengthening: extend `scripts/workflow-check.sh` Layer-2 to enumerate `fix(` commits as well as `feat(`, treating any `fix(` commit since the latest released tag as one that should appear in [Unreleased]. The 0.4.0-cycle motivating example for Layer-2 was a `feat(s8): ogdb demo subcommand` slipping through; the cycle-19 example here generalises that to `fix(paths): …` — same root cause (no [Unreleased] bullet for a shipped change), just a different commit type. Without the strengthening, this drift class can recur.

---

### F03 — LOW — `DESIGN.md:2092` + `:2107` still reference `~/.opengraphdb/config.toml` in §34 "Configuration System" prose (cycle-19 F04 carry-forward; cycle-19 `fb0ec7a` deliberately scoped narrow and excluded `DESIGN.md`)

- **Severity:** LOW. **Carry-forward from cycle-19 F04.** Both references describe a never-shipped feature (the original Decision-4 5-level priority chain that 0.4.0 collapsed to "CLI flags only"); the rhetorical drift has zero user-impact but contributes to the project-wide `\.opengraphdb` count being non-zero. Cycle-19's widened gate `TARGETS` array does not include `DESIGN.md` — partly because the prose is negative-assertion text and partly because folding it in would require a `<!-- HISTORICAL -->` opt-out marker pattern (analogous to `scripts/check-benchmarks-vocabulary-mirror.sh`'s approach).

  Compounding LOW staleness: §34 prose at L2096 says "Reality check (0.4.0)" and L2099 says "0.4.0 uses **CLI flags only**" — the workspace is at 0.5.1 now and cycle-19 fixes have landed; the version anchors in the §34 prose are stale. Low-impact but bookkeeping drift.

- **Locations:**
  ```
  DESIGN.md:2090   ## 34. Configuration System
  DESIGN.md:2092   > **Reality check (0.4.0):** the original Decision-4 sketch in this
  DESIGN.md:2095   > `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
  DESIGN.md:2099   > None of the file or env layers shipped — 0.4.0 uses **CLI flags
  DESIGN.md:2105   ### Surface in 0.4.0
  DESIGN.md:2107   - **No global `~/.opengraphdb/config.toml`** and no
  DESIGN.md:2108     `OGDB_BUFFER_POOL_SIZE`-style env vars in 0.4.0. Document any
  DESIGN.md:2113   The config-file / env-var hierarchy is on the v0.5 ergonomics roadmap
  ```

- **Patch sketch:** sweep the dotdir token + bump version anchors in one pass:
  ```diff
  --- a/DESIGN.md
  +++ b/DESIGN.md
  @@ -2092 +2092 @@
  -> **Reality check (0.4.0):** the original Decision-4 sketch in this
  +> **Reality check (0.5.1):** the original Decision-4 sketch in this
  @@ -2095 +2095 @@
  -> `~/.opengraphdb/config.toml` → env vars → CLI flags → per-database
  +> `~/.ogdb/config.toml` → env vars → CLI flags → per-database
  @@ -2099 +2099 @@
  -> None of the file or env layers shipped — 0.4.0 uses **CLI flags
  +> None of the file or env layers shipped through 0.5.1 — current shape uses **CLI flags
  @@ -2105 +2105 @@
  -### Surface in 0.4.0
  +### Surface in 0.5.1
  @@ -2107,2 +2107,2 @@
  -- **No global `~/.opengraphdb/config.toml`** and no
  -  `OGDB_BUFFER_POOL_SIZE`-style env vars in 0.4.0. Document any
  +- **No global `~/.ogdb/config.toml`** and no
  +  `OGDB_BUFFER_POOL_SIZE`-style env vars in 0.5.1. Document any
  @@ -2113 +2113 @@
  -The config-file / env-var hierarchy is on the v0.5 ergonomics roadmap
  +The config-file / env-var hierarchy is on the v0.6 ergonomics roadmap
  ```

  After the sweep, the project-wide `git grep -nE '\.opengraphdb' -- ':!documentation/EVAL-*' ':!target/' ':!node_modules/' ':!scripts/check-install-demo-path-matches-binary-default.sh' ':!scripts/test-check-install-demo-path-matches.sh' ':!scripts/test-check-opengraphdb-path-coherence.sh' ':!scripts/test.sh' ':!CHANGELOG.md' ':!frontend/src/stores/settings.ts'` would return zero — closing the loop on F01–F03 from cycle-19 + this F03 with a clean project-wide grep.

---

### F04 — MEDIUM — `documentation/COMPATIBILITY.md:3` doc-level Status stamp still says "active as of v0.4.0 · 2026-05-01" — workspace is at 0.5.1 and cycle-19 fixes have landed

- **Carry-forward from cycle-19 F07 (cycle-18 F07 / cycle-17 F07) — not addressed by either cycle-19 commit.** Severity unchanged. Cycle-20 stamp should read e.g. "active as of v0.5.1 · 2026-05-05 (last reviewed cycle-20; cycle-19 closed all three cycle-19 HIGHs)".

- **Patch sketch:**
  ```diff
  --- a/documentation/COMPATIBILITY.md
  +++ b/documentation/COMPATIBILITY.md
  @@ -3 +3 @@
  -**Status:** active as of v0.4.0 · 2026-05-01
  +**Status:** active as of v0.5.1 · 2026-05-05 (last reviewed cycle-20)
  ```

  Same `scripts/check-readme-version.sh`-style pattern could pin this stamp to `Cargo.toml` minor, mirroring the existing `scripts/check-security-supported-version.sh` approach for `SECURITY.md`'s Supported Versions row. Without a gate, this drift recurs every minor.

---

### F05 — MEDIUM — `documentation/COMPATIBILITY.md:44` still says "Future releases add a v0.5.0 fixture beside it" — `crates/ogdb-core/tests/upgrade_fixture_v0_5_0_opens_on_current.rs` exists since cycle-15

- **Carry-forward from cycle-19 F05 (cycle-18 F05 / cycle-17 F05) — not addressed by either cycle-19 commit.** Patch sketch identical to cycle-19 F05:
  ```diff
  -- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` ships a checked-in v0.4.0 fixture and asserts the current binary opens it. Any format-version bump that breaks readability fails this test in CI. Future releases add a v0.5.0 fixture beside it; the test scaffold is designed to grow.
  +- **Upgrade test gate:** `crates/ogdb-core/tests/upgrade_fixture_v0_4_0_opens_on_current.rs` (v0.4.0) and `…/upgrade_fixture_v0_5_0_opens_on_current.rs` (v0.5.0) ship checked-in fixtures and assert the current binary opens them. Any format-version bump that breaks readability fails these tests in CI. Future releases add a v0.6.0 fixture beside them; the test scaffold is designed to grow.
  ```

---

### F06 — MEDIUM — `documentation/COMPATIBILITY.md:94` § 6 release-time runbook only enumerates `upgrade_fixture_v0_4_0_opens_on_current` — v0.5.0 fixture not in the runbook

- **Carry-forward from cycle-19 F06 (cycle-18 F06 / cycle-17 F06) — not addressed by either cycle-19 commit.** Patch sketch identical to cycle-19 F06:
  ```diff
  -3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` — the v0.4.0 baseline fixture still opens (Finding 12, this document).
  +3. Pass `cargo test -p ogdb-core --test upgrade_fixture_v0_4_0_opens_on_current` and `cargo test -p ogdb-core --test upgrade_fixture_v0_5_0_opens_on_current` — the v0.4.0 and v0.5.0 baseline fixtures still open (Finding 12, this document).
  ```

---

### F07 — MEDIUM — `documentation/SECURITY-FOLLOWUPS.md:26` release-notes blockquote still reads "tracked as a post-v0.5 task"; `scripts/check-followup-target-not-current.sh`'s regex catches `vX.Y follow-up` only and `post-vX.Y` slips through

- **Carry-forward from cycle-19 F08 (cycle-18 F08 / cycle-17 F08) — not addressed by either cycle-19 commit.** Cycle-19's only structural-gate change (`scripts/check-install-demo-path-matches-binary-default.sh` widening) is unrelated to the followup-target regex. Patch sketch identical to cycle-19 F08:
  ```diff
  --- a/scripts/check-followup-target-not-current.sh
  +++ b/scripts/check-followup-target-not-current.sh
  -PATTERN='\bv[0-9]+\.[0-9]+(\.[0-9]+)?[[:space:]]+follow-up\b'
  +PATTERN='\b(v|post-v)[0-9]+\.[0-9]+(\.[0-9]+)?([[:space:]]+(follow-up|task|item))?\b'
  ```
  Then sweep `documentation/SECURITY-FOLLOWUPS.md:26` to `v0.6.0 task (slipped from the original v0.5 target)` so the regex finds a future minor.

---

### F08 — LOW — `documentation/BENCHMARKS.md:33` deltas-table header attribution "(full audit, cycle-15)" is stale — cycle-16 `f72f7cd` extended the table with rows 1+2; cycle-17/cycle-18/cycle-19 made no further extension

- **Carry-forward from cycle-19 F09 (cycle-18 F09 / cycle-17 F09) — not addressed by either cycle-19 commit.** Bookkeeping drift. Patch sketch identical to cycle-19 F09:
  ```diff
  -> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15).** The
  +> **0.3.0 → 0.4.0 N=5-vs-N=5 deltas (full audit, cycle-15 + cycle-16).** The
  ```

---

### F09 — LOW — `frontend/e2e/qa-followups.spec.ts:3` cites a private scratch-worktree QA-REPORT.md path under a tempdir-style prefix — gate scope (`scripts/check-public-doc-tmp-leak.sh`) does not cover `frontend/e2e/`

- **Carry-forward from cycle-19 F10 (cycle-18 F10 / cycle-17 F10) — not addressed by either cycle-19 commit.** Reader-impact bounded; either drop the path-citation, move the audit report to `documentation/audits/`, or extend `scripts/check-public-doc-tmp-leak.sh` to also cover `frontend/e2e/`.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| BLOCKER  | 0     | —   |
| HIGH     | 0     | —   |
| MEDIUM   | 6     | F01, F02, F04, F05, F06, F07 |
| LOW      | 3     | F03, F08, F09 |

### Severity changes vs. cycle-19

- **Closed in cycle-19:** C19 F01 (init_agent.rs `~/.opengraphdb` defaults at L35/234/274/454, by `fb0ec7a`'s 4-hit sweep + the widened gate's `init_agent.rs` target); C19 F02 (skill bundle wrapper scripts default at `~/.opengraphdb/demo.ogdb` + `OGDB_LOG_DIR`, by `fb0ec7a`'s 4-hit sweep + the widened gate's `skills/opengraphdb/scripts` target); C19 F03 (skill bundle reference docs teach `~/.opengraphdb/demo.ogdb`, by `fb0ec7a`'s 9-hit sweep + the widened gate's `skills/opengraphdb/references` target). Mechanically verified: gate passes; red-green meta-test `scripts/test-check-opengraphdb-path-coherence.sh` 7/7 cases pass; `git grep '\.opengraphdb' …` returns zero unexempted hits in the three target sub-trees.
- **New MEDIUM (cycle-19-introduced by `fb0ec7a`):** F01 (this report) — widened gate's `TARGETS` array enumerates 3 sub-paths but `include_dir!` deposits the entire `skills/opengraphdb/` tree; `SKILL.md` + `eval/cases.yaml` + any future subdir are out of scope. Currently latent (those files are clean), but the gate's contract is narrower than the deposit surface and reproduces the cycle-19 F01-F03 root cause class (scope-too-narrow gate).
- **New MEDIUM (cycle-19-introduced by `fb0ec7a` + `ae7ebb5`):** F02 (this report) — neither cycle-19 commit added a [Unreleased] CHANGELOG bullet; `scripts/workflow-check.sh` Layer-2 is `feat(`-only and didn't gate the `fix(paths)` / `fix(migration-spec)` pair, breaking from the cycle-15/cycle-18 convention.
- **Carry-forward MEDIUMs** (4): F04 / F05 / F06 / F07 = C19 F07 / F05 / F06 / F08, unchanged. Cycle-19's commits don't touch any of these surfaces and don't widen the followup-target regex.
- **Carry-forward LOWs** (3): F03 / F08 / F09 = C19 F04 / F09 / F10, unchanged.

### Gate coverage assessment

The cycle-19 widened gate `scripts/check-install-demo-path-matches-binary-default.sh` is the right shape for what it set out to enforce — it scans the three sub-trees that exhibited drift in cycle-19 and exempts the two legitimate non-filesystem-path forms (`mcp.opengraphdb.<tool>` API namespace + `mcpServers.opengraphdb` jq key). The new red-green meta-test `scripts/test-check-opengraphdb-path-coherence.sh` (7 cases: clean, planted in 3 surfaces, two legitimate exemptions, live repo) is rigorous and confirms the widening's intended coverage.

The remaining gap is **F01 (this report)**: the gate's `TARGETS` array enumerates 3 sub-paths but `include_dir!` deposits everything under `skills/opengraphdb/`. This gap is currently latent (the four out-of-scope skill-bundle files are clean of `\.opengraphdb` tokens), but it reproduces the same scope-too-narrow root cause that motivated the cycle-19 widening in the first place. Tightening `TARGETS[2]` from `"$ROOT/skills/opengraphdb/scripts"` + `TARGETS[3]` from `"$ROOT/skills/opengraphdb/references"` to a single `"$ROOT/skills/opengraphdb"` closes the gap completely.

The other gate gap surfaced this cycle is **F02 (this report)**: `scripts/workflow-check.sh` Layer-2 enumerates `feat(` commits only, so `fix(`-prefixed cycle-19 commits slipped through the CHANGELOG-coverage check. The cycle-3 motivating example for Layer-2 was a `feat(s8): ogdb demo subcommand` slipping through; cycle-19's `fix(paths): complete sweep` is the same drift class with a different commit type. Widening Layer-2 to enumerate both `feat(` and `fix(` commits since the latest released tag — and treating any unmapped one as a failure — generalises Layer-2 from "feature coverage" to "shipped-change coverage", which matches the AGENTS rule's actual wording ("Every completed change must have an entry in `Unreleased`").

### Headline

Cycle-19's two-commit fix-set (`ae7ebb5` + `fb0ec7a`) cleanly closes all three cycle-19 HIGHs (F01-F03) introduced by cycle-18's narrow path-bump. The widened gate is rigorous and red-green tested, and the e2e selector update mirrors cycle-18 F02's restructure correctly. **First clean round of HIGHs after the cycle-15 → cycle-19 partial-sweep arc.**

What remains:

1. **One latent gate gap (F01, MEDIUM):** the widened gate scope (`init_agent.rs` + 2 sub-trees of skill bundle) is narrower than the binary's `include_dir!` deposit surface (entire `skills/opengraphdb/`). Tightening `TARGETS` to a single `skills/opengraphdb` entry closes it completely and pre-empts the next instance of the cycle-15 → cycle-19 partial-sweep root cause.
2. **One process-drift bullet (F02, MEDIUM):** cycle-19's two commits didn't add CHANGELOG [Unreleased] entries because `workflow-check.sh` Layer-2 is `feat(`-only. Adding two bullets (or merging into the existing L10 bullet) plus widening Layer-2 to also enumerate `fix(` commits resolves the immediate drift and pre-empts recurrence.
3. **Four MEDIUMs + three LOWs carried forward unchanged from cycle-19** (4 in COMPATIBILITY.md / SECURITY-FOLLOWUPS.md; 3 in DESIGN.md / BENCHMARKS.md / qa-followups.spec.ts). None of them are touched by either cycle-19 commit. The COMPATIBILITY.md trio (F04/F05/F06) is the largest concentrated cluster — addressing those three together with one commit would close half of the cycle-20 outstanding queue.

The cycle-15 → cycle-19 partial-sweep pattern (cycle-N's targeted fix lands the headline change but leaves N-1 mirror surfaces stale; cycle-N+1 catches them) is now closed for the path-bump class. The remaining drift surfaces (F04–F09) are version-stamp / followup-target / attribution drifts that pre-date the partial-sweep arc and have been carry-forwards since cycle-15 / cycle-16 / cycle-17. They are bookkeeping-grade and individually low-risk, but the cumulative count (4M + 3L pinned at the same numbers across 5 cycles) signals the project would benefit from a "stamp / followup / attribution" sweep cycle that addresses them as a coordinated batch rather than as isolated future fixes.
