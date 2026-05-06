# Rust Workspace Audit — 2026-05-06

Staff/principal-engineer release-readiness review against `origin/main` @ `23e8327`.

Audit ground truth: detached worktree `/tmp/wt-audit-rust`, toolchain 1.88.0,
`cargo build`, `cargo test --release`, and `cargo clippy --all-targets
-- -D warnings` run **per crate** (workspace-wide cargo invocations crash a
peer tmux). Skipped: `ogdb-bench` per audit charter.

---

## A. CI Quality Job — root cause + fix

**Failed job:** run `25421356131`, job `74564036986`, commit `23e8327`.

**Failing assertion (script log, last meaningful line):**
```
test FAILED: [RED dead-gate sentinel] expected non-zero, got 0
[check-frontend-node-api-surface] no marketing snippets reference
{@opengraphdb/mcp, opengraphdb} today; gate stays wired for future regressions
##[error]Process completed with exit code 1.
```

**Root cause:** the gate and its self-test contradict each other.

- `scripts/check-frontend-node-api-surface.sh:515-525` — when the scan visits
  zero imports / zero `new` / zero destructures, the gate **exits 0** (green
  outcome): "nothing to validate today is a green outcome, not a failure."
  Landed in `966045d` (2026-05-06).
- `scripts/test-check-frontend-node-api-surface.sh:223-248` — still asserts
  the dead-gate **must exit non-zero** *and* emit `"scanned 0"` to stderr,
  inherited from the cycle-30 python-api-surface mirror.

`966045d` shipped the green-outcome flip but did not update the test that
was enforcing the previous (loud-fail) contract. The CI quality job is the
forcing function and it is correctly red.

**Smallest fix** — update the test to match the new contract (the gate's
intent is correct: a wired gate with nothing to scan is not a regression).
Patch sketch for `scripts/test-check-frontend-node-api-surface.sh:223-248`:

```diff
-# --- RED: dead-gate sentinel — fixture without imports/new/destructs of
-# either gated package must fail with `scanned 0`. Mirror of the cycle-30
-# python-api-surface dead-gate pattern (LOW-1 from the same eval extends
-# this to the python gate; we land it directly here).
+# --- GREEN: dead-gate sentinel — fixture without imports/new/destructs of
+# either gated package is now a green outcome (cycle-33 cosmos removal
+# left the gate wired with nothing to scan; see commit 966045d). The check
+# emits the "no marketing snippets reference …" line and exits 0. The test
+# pins that exact contract so a future re-introduction of dead-gate-as-RED
+# becomes a visible diff.
 cat > "$TMP/frontend/src/Planted.tsx" <<'TSX'
 const SNIPPET = `// nothing relevant here`
 export const Planted = () => SNIPPET
 TSX
 set +e
 ( cd "$TMP" && "$TMP/scripts/check-frontend-node-api-surface.sh" >/tmp/out.$$ 2>&1 )
 rc=$?
 set -e
-if [[ "$rc" -eq 0 ]]; then
-  echo "test FAILED: [RED dead-gate sentinel] expected non-zero, got 0" >&2
+if [[ "$rc" -ne 0 ]]; then
+  echo "test FAILED: [GREEN dead-gate sentinel] expected rc=0, got $rc" >&2
   cat /tmp/out.$$ >&2
   rm -f /tmp/out.$$
   exit 1
 fi
-if ! grep -q "scanned 0" /tmp/out.$$; then
-  echo "test FAILED: [RED dead-gate sentinel] expected 'scanned 0' in stderr" >&2
+if ! grep -q "no marketing snippets reference" /tmp/out.$$; then
+  echo "test FAILED: [GREEN dead-gate sentinel] missing wired-but-empty banner" >&2
   cat /tmp/out.$$ >&2
   rm -f /tmp/out.$$
   exit 1
 fi
 rm -f /tmp/out.$$
-echo "test: [RED dead-gate sentinel] tripped with 'scanned 0' (expected)"
+echo "test: [GREEN dead-gate sentinel] no-snippet wired-but-empty path (expected)"
```

Alternative (smaller blast radius but worse signal): add `"scanned 0"` to
the gate's green-outcome banner in `check-frontend-node-api-surface.sh:520`
and keep the test's `grep -q "scanned 0"` line, but flip the rc expectation
from non-zero to zero. Either fix is one commit.

**One-line CI fix:** flip RED→GREEN expectations on the dead-gate sentinel
in `scripts/test-check-frontend-node-api-surface.sh` to match the gate's
new "wired-but-empty is fine" contract from commit 966045d.

---

## B. Per-crate verdict

| crate | tests | clippy `-D warnings` | dead deps | panics in non-test | architectural smells | severity |
|---|---|---|---|---|---|---|
| `ogdb-types` | 0 in-crate (covered via ogdb-core) | ✅ clean | ✅ machete clean | none | thin re-export crate, expected | LOW |
| `ogdb-vector` | 0 in-crate | ✅ clean | ✅ clean | none | seed crate; pure helpers untested in own crate | MEDIUM |
| `ogdb-algorithms` | 0 in-crate | ✅ clean | ✅ clean | none | **seed crate; Louvain/Leiden/label-prop kernels untested in own crate** — only validated transitively via ogdb-core's traversal tests | HIGH |
| `ogdb-text` | 0 in-crate | ✅ clean | ✅ clean | none | seed crate; tokenisation helpers untested | MEDIUM |
| `ogdb-temporal` | 0 in-crate | ✅ clean | ✅ clean | none | seed crate; bitemporal predicate untested | MEDIUM |
| `ogdb-import` | 0 in-crate | ✅ clean | ✅ clean | none | **seed crate; PDF + Markdown parser surfaces untested in own crate** — `parse_pdf_sections` / `parse_markdown_sections` validation lives only in ogdb-core | HIGH |
| `ogdb-export` | 0 in-crate | ✅ clean | ✅ clean | none | thin plain-data crate, expected | LOW |
| `ogdb-core` | 378 unit + 25 integration + 1 doctest, all green | ❌ `cast_sign_loss` at `tests/hnsw_query_under_5ms_p95_at_10k.rs:74` | ✅ clean | many `.unwrap()` / `.expect()` but ~all in `#[cfg(test)]` blocks | god-module: `src/lib.rs` is **41,297 LOC** in a single file; `Database` behind a single `Arc<RwLock<Database>>` (every write blocks every read) | **BLOCKER (clippy gate)** + HIGH (god-module) |
| `ogdb-bolt` | 4 integration test bins, all green | ✅ clean | ✅ clean | many `.expect()` in `crates/ogdb-bolt/src/lib.rs:1049-1075` — but those live in `#[cfg(test)]` round-trip helpers | clean dep stack (only `ogdb-core`) | LOW |
| `ogdb-cli` | 14 green test blocks, **2 FAILED** (`http_get_unknown_path_falls_back_to_index_html`, `http_get_root_serves_embedded_index_html` — both panic because `frontend/dist-app/` is the placeholder when SPA isn't pre-built; tests hard-panic instead of skipping) | ✅ clean | ✅ clean | several `.expect()` in dispatch / arg-parsing — acceptable invariants | **17,480 LOC `lib.rs`**; serves as the upstream dep for ogdb-ffi / ogdb-python / ogdb-node — bindings consume the *binary's* lib crate (layering smell: bindings should consume an `ogdb-server` crate, not the CLI) | **HIGH** |
| `ogdb-tck` | green | ✅ clean | ✅ clean | none | `publish=false` correctly set | LOW |
| `ogdb-eval` | 34 green test blocks | ❌ `redundant_closure` at `src/drivers/common.rs:201` (`(1..=100).map(\|i\| f64::from(i))` → `.map(f64::from)`) | ✅ clean | none | `publish=false`; clean | **HIGH (clippy gate)** |
| `ogdb-ffi` | 3 green test blocks | ✅ clean | ✅ clean | none | depends on `ogdb-cli` (layering — see ogdb-cli row); 18 `// SAFETY:` comments cover all 27 unsafe sites; `unsafe_op_in_unsafe_fn` enforced workspace-wide | MEDIUM |
| `ogdb-python` | 3 green test blocks | ✅ clean | ✅ clean | none | depends on `ogdb-cli`; macro-scoped `allow(unsafe_op_in_unsafe_fn)` documented at `crates/ogdb-node/src/lib.rs:16-26` (correct) | MEDIUM |
| `ogdb-node` | 3 green test blocks | ✅ clean | ✅ clean | none | depends on `ogdb-cli`; same scoped allow as Python | MEDIUM |
| `ogdb-fuzz` | green | ✅ clean | ✅ clean | none | `publish=false`; clean | LOW |
| `ogdb-e2e` | green | ✅ clean | ✅ clean | none | `publish=false`; clean | LOW |

`cargo machete` reports no unused deps anywhere in the workspace. Workspace
lints are tightened beyond defaults (`unsafe_op_in_unsafe_fn = "deny"`,
`undocumented_unsafe_blocks`, `must_use_candidate`, `cast_lossless`,
`cast_sign_loss` all `warn`-elevated to error via `-D warnings`); the two
clippy failures above are the only sites that haven't been swept yet.

---

## C. Architectural punch list — top 10 by leverage

1. **Split `ogdb-core/src/lib.rs` (41,297 LOC).** Largest single file in the
   workspace by 24,000 lines. The 6-crate seed split (vector / algorithms /
   text / temporal / import / export) is already in flight per the
   `.planning/ogdb-core-split-*` plans — the seeds carry plain-data only
   today and the runtime stays in `lib.rs`. **Highest leverage: every other
   refactor below is easier once this is broken into mod files.** Even a
   pure file-level split (no API change) would unlock per-area `cargo
   clippy` runs and per-area review tooling.
2. **Split `ogdb-cli/src/lib.rs` (17,480 LOC) into `ogdb-server` + thin
   `ogdb-cli`.** The current crate bundles argv parsing, the embedded HTTP
   server, the MCP dispatcher, RDF I/O, the static-asset embedder, and the
   readline REPL. Bindings (`ogdb-ffi`, `-python`, `-node`) all `use
   ogdb_cli::run as run_cli;` to drive the same dispatcher — that's the
   layering smell. Extract a leaf `ogdb-server` crate, and let the CLI +
   bindings consume it.
3. **Add tests *inside* the 6 seed crates.** `ogdb-algorithms` ships
   Louvain/Leiden/label-propagation kernels with **zero in-crate tests**;
   `ogdb-import` ships `parse_pdf_sections` + `parse_markdown_sections`
   with **zero in-crate tests**. They're validated only via ogdb-core's
   integration tests, so a future signature break that ogdb-core happens
   not to exercise will land green. Property tests on the pure helpers are
   the highest-ROI add (mostly `proptest` invariants — adjacency-monotone
   for label-propagation, idempotence for `chunk_content`, etc).
4. **Single `Arc<RwLock<Database>>` is the read/write contention point.**
   Every compaction request, every Cypher write, every snapshot all serialize
   through one `RwLock`. `crates/ogdb-core/src/lib.rs:8933,8957,8983,9017,9428,10028`.
   Sharding by store (catalog vs. nodes vs. edges vs. WAL) or moving the
   property-store under its own lock would unlock concurrent reads/writes
   on disjoint key ranges.
5. **First-time publish order undocumented.** `cargo publish --dry-run -p
   ogdb-types` fails with *"no matching package named `ogdb-vector` found
   on crates.io"* — none of the path-deps are on the index yet. Working
   order: `ogdb-vector → ogdb-types → ogdb-algorithms → ogdb-text →
   ogdb-temporal → ogdb-import → ogdb-export → ogdb-core → ogdb-bolt →
   ogdb-cli → ogdb-ffi → ogdb-python → ogdb-node`. Bake into
   `scripts/release.sh` or a `xtask publish-all`.
6. **No musl target in release.yml.** `file target/release/ogdb` →
   "dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2"; `ldd`
   pulls libc/libm/libgcc_s. Built on Ubuntu 24.04 GH runner →
   needs glibc 2.39+ at runtime. Common deployment surprises:
   Amazon Linux 2 (glibc 2.26), CentOS 7 (glibc 2.17), Alpine (musl).
   Add `x86_64-unknown-linux-musl` and `aarch64-unknown-linux-musl` rows to
   the matrix in `.github/workflows/release.yml` to deliver on the
   "single binary, no JVM, no sidecar" pitch.
7. **`ogdb-cli` HTTP static-asset tests panic when SPA isn't pre-built.**
   `crates/ogdb-cli/tests/http_static_assets.rs:188` asserts the served
   body contains `<div id="root"></div>`; without `npm run build:app`,
   the build emits the placeholder HTML (correctly served by the gate at
   `static_assets.rs:122`). Either gate the test on a `cfg(feature =
   "spa-built")` or detect the placeholder body and `return Ok(())` early.
   The current shape makes a clean `cargo test -p ogdb-cli` reproduce
   2/14 failures every time, which trains contributors to ignore RED.
8. **Wire `must_use_candidate` / `cast_lossless` ratchet to a fixed
   schedule.** Workspace lints carry an explicit cycle-5 ratchet for
   `cast_possible_truncation` (~300 sites in WAL replay). Pin a deadline
   in `Cargo.toml` so the ratchet doesn't slip — today the schedule lives
   in eval prose, not in code-enforcing form.
9. **`ogdb-ffi`/`-python`/`-node` should not depend on `ogdb-cli`.** They
   take `use ogdb_cli::run as run_cli;` — the binary's lib crate. Once #2
   lands and `ogdb-server` exists, repoint the bindings there. Until
   then, bindings inherit every ogdb-cli build flag (rustyline,
   include_dir embedding) for code paths they never use.
10. **No fuzz/property tests on WAL replay or snapshot recovery.**
    `ogdb-fuzz` carries fuzz harnesses (5 unit tests, all green), but
    `cargo fuzz` targets specifically for WAL-replay fault injection
    (truncated-tail, partial-page, torn-write) and snapshot/checkpoint
    interleaving aren't wired. Persistence is the riskiest non-test
    surface: a subtle WAL bug ships a corrupted database, not a stack
    trace. Highest-severity correctness debt.

---

## D. Release-readiness checklist

| Check | Status | Notes |
|---|---|---|
| All `[workspace.package]` versions consistent at `0.5.1` | 🟢 | `Cargo.toml:24`; every member uses `version.workspace = true`. |
| `publish=false` set on internal crates | 🟢 | `ogdb-bench`, `ogdb-e2e`, `ogdb-eval`, `ogdb-tck`, `ogdb-fuzz` all marked. |
| Public crates carry description / license / repo / keywords / categories | 🟢 | Inherited via `description.workspace = true` + per-crate `keywords` / `categories` lists; verified across all 13 publish-eligible crates. |
| `cargo publish --dry-run` clean per public crate | 🔴 | Fails *first time* because path-deps aren't on crates.io yet. Document publish order (#5 above). Once `ogdb-vector` is up, `ogdb-types` clears, etc. |
| All crate builds | 🟢 | 17 crates compile cleanly via `cargo build -p <crate>` (no `--workspace`). |
| All crate tests | 🟡 | 16/17 green. `ogdb-cli` has 2 SPA-static-asset failures (env issue, not a code bug — see Punch list #7). All others pass including `ogdb-core` (378 unit + 25 integration). |
| `cargo clippy --all-targets -- -D warnings` per crate | 🔴 | `ogdb-core` test target: `cast_sign_loss` at `tests/hnsw_query_under_5ms_p95_at_10k.rs:74`. `ogdb-eval` lib test: `redundant_closure` at `src/drivers/common.rs:201`. Both 1-line fixes. Other 15 crates clean. |
| `cargo machete` (unused deps) | 🟢 | Zero unused deps reported. |
| `unsafe` blocks documented | 🟢 | `ogdb-ffi`: 18 `// SAFETY:` comments cover its unsafe surface; workspace lint `unsafe_op_in_unsafe_fn = "deny"`. `ogdb-bench` has 2 SAFETY comments for the libc rusage calls. `ogdb-node` has documented macro-scoped allow. |
| Static / portable Linux binary | 🔴 | `target/release/ogdb` is glibc-linked (linux-gnu, not linux-musl). Add musl targets to `release.yml` (#6). |
| CI quality job green | 🔴 | Failing on `dead-gate sentinel` mismatch; one-line fix in `test-check-frontend-node-api-surface.sh` (Section A). |
| Workspace lint config sane | 🟢 | `unsafe_op_in_unsafe_fn = "deny"`, `undocumented_unsafe_blocks = "warn"`, ratcheting cast / pedantic policy documented in `Cargo.toml`. |

**Net release-readiness verdict:** 6 green ✅ / 1 yellow 🟡 / 4 red 🔴.

The 4 reds are all small (1-line clippy fixes ×2, 1 test-script flip, 1 CI
matrix addition). The 1 yellow is environmental (frontend SPA pre-build).
Nothing in this audit suggests `0.5.1` is structurally unsafe to ship —
but the clippy gate breaks for any contributor running the strict-mode
command, so closing #8/#9 of the punch list before tagging is the
prudent call.

---

## Reproducer

```bash
git fetch origin --quiet
git worktree add --detach /tmp/wt-audit-rust origin/main

# Per-crate build / test / clippy (NEVER --workspace, crashes peer tmux):
for c in ogdb-types ogdb-vector ogdb-algorithms ogdb-text ogdb-temporal \
         ogdb-import ogdb-export ogdb-core ogdb-bolt ogdb-cli ogdb-tck \
         ogdb-eval ogdb-ffi ogdb-python ogdb-node ogdb-fuzz ogdb-e2e; do
  cargo build  -p "$c"
  cargo test   -p "$c" --release
  cargo clippy -p "$c" --release --all-targets -- -D warnings
done

# CI fix repro:
bash scripts/test-check-frontend-node-api-surface.sh   # FAILS RED dead-gate
```
