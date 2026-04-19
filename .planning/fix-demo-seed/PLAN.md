# fix-demo-seed — PLAN

Branch: `fix/demo-seed` • Phase 2 of 8 (RED-test commit, stop here)

---

## (0) Existing-work scan

- **`gh pr/issue list --search "demo_datasets OR movies.json OR movielens"`** — zero PRs, zero issues. No in-flight or historical GitHub work on this exact drift.
- **`git log --all -S 'movies.json'`** — the synthetic `movies.json` fixture originates in phase 06 (commits `926339c` → `5f54f44`, "feat(frontend): complete Phase 6 demo datasets and live backend integration"). Phase 7 later tore it out.
- **`git log --all -S 'movielens.json'`** — introduced by phase 07 commit `bfa8719` ("feat(07-01): download and conversion scripts for 4 famous datasets") and committed wholesale in `c8b812c` ("feat(07-01): extend seed-demo.sh for all 4 real-world datasets").
- **`.planning/phases/07-real-world-famous-dataset-showcase/07-VERIFICATION.md:77`** — explicitly records `datasets/movies.json` as `CONFIRMED DELETED`. The test that still reads that file was never audited against this deletion.

Conclusion: no duplicate work; this is honest leftover drift from the phase-06 → phase-07 fixture replacement.

---

## (1) Problem summary

`crates/ogdb-cli/tests/demo_datasets_seed.rs` hard-codes reads of `datasets/movies.json`, `datasets/social.json`, and `datasets/fraud.json` — all three were removed in phase 07 when the real-world fixture set (`movielens.json`, `airroutes.json`, `got.json`, `wikidata.json`) replaced the phase-06 synthetic trio. Beyond the filename drift, the test's body is also schema-obsolete: it asserts Movie/Person/Genre labels, required titles like "The Matrix", specific ID ranges (0–261, 500–779, 1000–1314), and the presence of Keanu Reeves — none of which exist in the MovieLens-derived data.

---

## (2) Exact reproducer

```bash
cargo test -p ogdb-cli --test demo_datasets_seed
```

Expected failure on the first three tests (all three call `read_dataset(...)` on a removed path and then `fs::read_to_string(...)` panics via `unwrap_or_else`):

```
thread 'datasets_have_numeric_ids_non_overlap_and_sequential_ranges' panicked at crates/ogdb-cli/tests/demo_datasets_seed.rs:29:
read dataset <repo>/datasets/movies.json failed: No such file or directory (os error 2)

thread 'movies_dataset_meets_flagship_requirements' panicked at crates/ogdb-cli/tests/demo_datasets_seed.rs:29:
read dataset <repo>/datasets/movies.json failed: No such file or directory (os error 2)

thread 'social_and_fraud_datasets_meet_domain_constraints' panicked at crates/ogdb-cli/tests/demo_datasets_seed.rs:29:
read dataset <repo>/datasets/social.json failed: No such file or directory (os error 2)
```

`seed_demo_script_is_executable_and_idempotent` (the fourth test) passes — it runs `scripts/seed-demo.sh` which was already migrated to the four real-world datasets.

---

## (3) Data-flow trace

Fixture paths are **inlined string literals**, not shared constants:

| Location | Literal | Reality |
|----------|---------|---------|
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:94`  | `"datasets/movies.json"`  | file absent (deleted in phase 07) |
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:101` | `"datasets/social.json"`  | file absent (deleted in phase 07) |
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:108` | `"datasets/fraud.json"`   | file absent (deleted in phase 07) |
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:172` | `"datasets/movies.json"`  | file absent |
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:397` | `"datasets/social.json"`  | file absent |
| `crates/ogdb-cli/tests/demo_datasets_seed.rs:398` | `"datasets/fraud.json"`   | file absent |

Actual `datasets/` directory contents (canonical, from phase 07 verification):

```
datasets/airroutes.json
datasets/got.json
datasets/movielens.json
datasets/wikidata.json
```

Canonical producers live at `scripts/convert-{movielens,airroutes,got,wikidata}.py`; `scripts/convert-movielens.py:17` writes the canonical `OUT_PATH = datasets/movielens.json`. `scripts/seed-demo.sh:14` whitelists exactly `{movielens, airroutes, got, wikidata}` — it is the single source of truth for canonical names.

---

## (4) Failing tests — strategy decision

**Framing choice: option (b).** The name change from `movies.json` → `movielens.json` was deliberate and part of a phase-level deletion (`07-VERIFICATION.md` marks it `CONFIRMED DELETED`). A one-character path patch is insufficient because the test body depends on the **old schema** (Movie/Person/Genre labels, required titles, specific ID ranges) — the MovieLens fixture has no Person nodes, no Keanu Reeves, different IDs (0–8018), `_dataset == "movielens"` not `"movies"`, and is a completely different shape. Any attempt to "patch the path" would cascade into 200+ lines of assertion drift.

Durable guard chosen: add a small **canonical-names smoke test** that is independent of dataset schema and asserts the contract `seed-demo.sh` already enforces: `datasets/` contains the four canonical JSON files, each parses, each has non-empty `nodes` and `edges` arrays, and the stale phase-06 filenames do **not** exist. This catches re-drift in either direction (removal or re-introduction of stale names) without embedding schema detail.

**Committed in this Phase-2 RED commit:**

- `datasets_fixture_canonical_names_smoke_test` — new test appended to `crates/ogdb-cli/tests/demo_datasets_seed.rs`. Currently GREEN (the canonical files do exist); its role is to lock the contract so that Phase-3 schema-test rewrites cannot silently drop it and so any future rename is caught in CI.
- The three pre-existing broken tests stay in place (RED) as the literal failing signal that Phase 3 will resolve.

**What stays RED into Phase 3:**

- `datasets_have_numeric_ids_non_overlap_and_sequential_ranges`
- `movies_dataset_meets_flagship_requirements`
- `social_and_fraud_datasets_meet_domain_constraints`

**What stays GREEN throughout:**

- `seed_demo_script_is_executable_and_idempotent` (already aligned with current fixtures).
- `datasets_fixture_canonical_names_smoke_test` (new in this commit).

---

## (5) Implementation sketch (Phase-3 GREEN — preview only, not executed yet)

Least-disruptive shape, in one file (`crates/ogdb-cli/tests/demo_datasets_seed.rs`):

1. Delete the three obsolete tests (`datasets_have_numeric_ids_non_overlap_and_sequential_ranges`, `movies_dataset_meets_flagship_requirements`, `social_and_fraud_datasets_meet_domain_constraints`) — they are inextricable from deleted fixtures; no salvage is worth the line cost.
2. Keep `seed_demo_script_is_executable_and_idempotent` unchanged (already passes).
3. Keep the new `datasets_fixture_canonical_names_smoke_test` (this commit).
4. **Optional lightweight add-on** (only if worth it, decided in Phase 4): a single per-dataset parametric smoke assertion — `_dataset` property tag on a sampled node matches filename stem, top-level `format_version == 1` or equivalent. Kept intentionally thin to avoid re-creating the same drift problem.

No rename of `datasets/*.json` files. No changes to `scripts/*.py` or `scripts/seed-demo.sh`. No changes to any non-test code.

---

## (6) Scope boundaries

**IN**
- `crates/ogdb-cli/tests/demo_datasets_seed.rs` (delete obsolete tests in Phase 3; add canonical-names smoke test in this Phase-2 commit)
- `.planning/fix-demo-seed/PLAN.md` (this file)

**OUT**
- `datasets/*.json` — no rename, no regeneration
- `scripts/convert-*.py` and `scripts/seed-demo.sh` — already canonical
- All other crates, the frontend, docs, benchmark suite
- The uncommitted `fix/write-perf` work currently in the working tree — touched zero files in that family

---

## (7) Decision log

| Date       | Decision | Rationale |
|------------|----------|-----------|
| 2026-04-19 | Option (b): add canonical-names smoke guard, delete obsolete tests in Phase 3 rather than patching paths | Old tests encode phase-06 schema that no longer exists; a path patch would cascade into ~200 lines of asserted-content drift. Smoke guard is schema-independent and catches either direction of future re-drift. |

---

## (8) Success criteria

- `cargo test -p ogdb-cli --test demo_datasets_seed` exits 0 (all tests green) after Phase 3.
- `datasets_fixture_canonical_names_smoke_test` exists and passes.
- `grep -rn "movies\.json\|social\.json\|fraud\.json" crates/ scripts/` returns zero matches outside comments/docs. (Confirmed clean outside the test file today; Phase 3 removes the test-file references.)
- `grep -rn "datasets/movielens\.json\|datasets/airroutes\.json\|datasets/got\.json\|datasets/wikidata\.json" crates/ scripts/` shows all four canonical names reachable from the test + seed script paths.
- No other consumer of the old names exists in code (verified: `grep crates/` and `grep scripts/` for the three stale basenames returned nothing today — only `docs/`, `.planning/`, and `CHANGELOG.md` still mention them, which is correct historical record-keeping).
