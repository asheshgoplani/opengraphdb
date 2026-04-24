# fuzzing-harness — cargo-fuzz targets for Cypher parser + WAL record reader

> **Phase 2 artifact.** This document + the RED scaffold at
> `crates/ogdb-fuzz/` (stub Cargo manifest, empty lib, and a failing
> existence test at `crates/ogdb-fuzz/tests/targets_compile.rs`)
> constitute the RED commit on branch `plan/fuzzing-harness`.
>
> Phases 3–5 (GREEN) add the two fuzz target binaries under
> `crates/ogdb-fuzz/fuzz/fuzz_targets/` plus the nested
> `crates/ogdb-fuzz/fuzz/Cargo.toml` that cargo-fuzz requires. Phases 6–8
> cover README, seed corpora, and CHANGELOG.

**Goal:** land a libFuzzer-backed fuzz harness in a **new, isolated
crate** `crates/ogdb-fuzz/` with two targets —
`fuzz_cypher_parser` and `fuzz_wal_record_reader` — so the team can
run `cargo +nightly fuzz run <target>` locally and surface panics or
infinite loops on adversarial inputs. `ogdb-core` is **not
modified**: the harness consumes `parse_cypher(&str)` and
`Database::open(&Path)` (the only WAL-replay entrypoint that takes
bytes) as library calls.

**Tech stack:** Rust 2021 nightly (cargo-fuzz requirement), `libfuzzer-sys`
crate, nested cargo-fuzz workspace under `crates/ogdb-fuzz/fuzz/`.
No production-path code, no dev-deps on ogdb-core added.

---

## 1. Problem summary — no fuzzing today; panics-on-malformed-input are undetected

- There is no `crates/ogdb-fuzz/` directory, no nested `fuzz/` workspace,
  no libFuzzer targets, and no entry in the root `Cargo.toml`
  `[workspace] members` for a fuzz crate. The parser (`parse_cypher`
  at `crates/ogdb-core/src/lib.rs:6651`) and the WAL replay path
  (`Database::open` → private `recover_from_wal_bytes` at
  `crates/ogdb-core/src/lib.rs:22303`) have unit-test coverage only
  for hand-curated malformed inputs (e.g.
  `open_rejects_unknown_wal_record_type`,
  `open_rejects_wal_shorter_than_header`,
  `open_rejects_invalid_wal_magic` at lines 24257, 24278, 24293).
- These hand-curated cases exercise ~5 bytes of WAL surface area.
  The WAL reader has branches on record tag (1, 2, 3), 4-byte length
  prefixes, embedded JSON (labels + props via `serde_json::from_slice`),
  and variable-length payloads — a corpus an adversary can reach
  through a crafted `.ogdb-wal` file. Any panic here is a hard-DoS
  bug, because `Database::open` is called by every CLI command and
  by every embedded user on startup.
- The Cypher parser is a 10K+-line hand-written winnow-based state
  machine starting at `parse_cypher` / the nested `parse_query` at
  line 6897. Arithmetic on token indices, unicode handling, and
  recursion depth are all opportunities for `unwrap()`/overflow/stack
  overflow. There is no panic-safety guarantee today.

**Net:** any input that causes `parse_cypher` or `Database::open` to
panic is an availability bug that would ship to users today, undetected.
A fuzz harness is the industry-standard mitigation and is a one-afternoon
investment.

## 2. Exact reproducer

```bash
cd ~/opengraphdb
cargo fuzz list
```

Output today:
```
error: no such command: `fuzz`

        View all installed commands with `cargo --list`
        Find a package to install `fuzz` with `cargo search cargo-fuzz`
```

And even if `cargo-fuzz` were installed (`cargo install cargo-fuzz`):
```bash
cargo fuzz list
# error: could not find `fuzz` subdirectory
```

because no crate in the workspace contains a `fuzz/` subdir. There is
nothing to run.

After this plan lands (GREEN), the same commands must produce:
```bash
$ cd crates/ogdb-fuzz
$ cargo +nightly fuzz list
fuzz_cypher_parser
fuzz_wal_record_reader
$ cargo +nightly fuzz run fuzz_cypher_parser -- -max_total_time=60
# libFuzzer banner, corpus minimization, runs for 60 s
```

## 3. Data-flow trace (fuzz input → target function → panic-or-Ok)

### 3.1 `fuzz_cypher_parser`

```
┌─────────────────────────────────────────────────────────────────┐
│ libFuzzer driver (libfuzzer-sys)                                │
│   seed corpus: crates/ogdb-fuzz/fuzz/corpus/fuzz_cypher_parser/ │
│   each entry is a raw byte string                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ fuzz_target!(|data: &[u8]| { ... })                             │
│   crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_cypher_parser.rs      │
│                                                                 │
│   let Ok(s) = std::str::from_utf8(data) else { return };        │
│   let _ = ogdb_core::parse_cypher(s);                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ ogdb_core::parse_cypher(&str) -> Result<CypherAst, ParseError>  │
│   crates/ogdb-core/src/lib.rs:6651                              │
│                                                                 │
│   Ok(ast)  → harness drops it, returns; libFuzzer mutates again │
│   Err(_)   → harness drops it, returns; libFuzzer mutates again │
│   panic!   → libFuzzer captures, writes reproducer to           │
│              artifacts/fuzz_cypher_parser/crash-<sha>           │
│   infinite loop → libFuzzer -timeout=25 kicks in, same artifact │
└─────────────────────────────────────────────────────────────────┘
```

**Why `from_utf8` is a gate, not a panic source:** `parse_cypher` takes
`&str`, so we must drop non-UTF-8 inputs. The `return` yields a boring
coverage-less trace that libFuzzer will prune — not a crash — which
is correct behaviour.

### 3.2 `fuzz_wal_record_reader`

The WAL replay path that consumes raw bytes is a **private** method
(`recover_from_wal_bytes` at line 22303). The only public surface that
feeds it arbitrary bytes is `Database::open(&Path)`. We respect the
scope constraint (no edits to `ogdb-core`) by giving the fuzz target a
per-run tempdir and delivering the fuzz input through the WAL file the
real DB reads.

```
┌─────────────────────────────────────────────────────────────────┐
│ libFuzzer driver                                                │
│   seed corpus: crates/ogdb-fuzz/fuzz/corpus/                    │
│                fuzz_wal_record_reader/                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ fuzz_target!(|data: &[u8]| { ... })                             │
│   crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_wal_record_reader.rs  │
│                                                                 │
│   // 1. One-time-per-iter tempdir keeps us hermetic.            │
│   let tmp = tempfile::tempdir().expect("tempdir");              │
│   let db_path = tmp.path().join("fuzz.ogdb");                   │
│                                                                 │
│   // 2. Init a real DB so sidecars exist.                       │
│   let db = ogdb_core::Database::init(                           │
│       &db_path, ogdb_core::Header::default_v1(),                │
│   ).expect("init cannot fail on a fresh tempdir");              │
│   let wal = db.wal_path();                                      │
│   drop(db); // release file handles                             │
│                                                                 │
│   // 3. Replace the WAL contents with the fuzz bytes verbatim.  │
│   std::fs::write(&wal, data).expect("write wal bytes");         │
│                                                                 │
│   // 4. Re-open. This runs recover_from_wal_bytes(data).        │
│   let _ = ogdb_core::Database::open(&db_path);                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│ Database::open → recover_from_wal_bytes(&bytes)                 │
│   crates/ogdb-core/src/lib.rs:22303                             │
│                                                                 │
│   Ok(()) | Err(DbError::Corrupt(_)) | Err(DbError::Io(_))       │
│     → harness drops return value, tempdir auto-cleans, return   │
│   panic! → libFuzzer captures reproducer                        │
│   infinite loop → libFuzzer timeout                             │
└─────────────────────────────────────────────────────────────────┘
```

**Why tempdir is per-iteration, not per-process:** reusing a tempdir
across iterations would leak sidecar files (`.ogdb-meta.json`,
`.ogdb-props`, `.ogdb-csr.json`) between runs and bias coverage toward
"WAL + stale-sidecar" shapes. Per-iter costs ~2 ms on tmpfs and
guarantees clean state. This is the same trade-off the
`serde_structured_fuzz` crates in the Rust ecosystem make.

**Why init-then-reopen instead of hand-crafting sidecars:** `Database::init`
is the only documented way to produce a valid sidecar set, and it's
public and stable. The alternative (constructing the on-disk format
by hand in the fuzz target) would lock the harness to private format
details and would drift when `ARCHITECTURE.md` §4 evolves.

### 3.3 Crash → reproducer → fix loop

When libFuzzer finds a crash:

```
crates/ogdb-fuzz/fuzz/artifacts/fuzz_cypher_parser/crash-<sha>
  binary blob — the exact &[u8] the target saw
```

Replay deterministically:
```bash
cargo +nightly fuzz run fuzz_cypher_parser \
  crates/ogdb-fuzz/fuzz/artifacts/fuzz_cypher_parser/crash-<sha>
```

The file is committed (never rm'd) to the regression corpus; the
underlying panic is fixed in `ogdb-core` on a separate branch
(scope §6 below keeps that separate).

## 4. Failing tests (RED) — committed in this branch

The tests at `crates/ogdb-fuzz/tests/targets_compile.rs` run on **stable
Rust** (the CI toolchain). They do **not** shell out to `cargo +nightly
fuzz build` — that would require nightly + cargo-fuzz on every CI node
and would make CI flaky. Instead they are **source-level compile-safety
checks**: they verify the files the fuzz harness needs actually exist
and have the expected `fuzz_target!` macro invocation and the right
library call. This matches the user's "simple compile-only check as a
unit test to keep CI fast" requirement.

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | `fuzz_subdir_exists` | `crates/ogdb-fuzz/fuzz/` exists, is a directory, and contains a `Cargo.toml`. |
| 2 | `cypher_parser_target_source_exists` | `crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_cypher_parser.rs` exists and contains the substrings `fuzz_target!` AND `ogdb_core::parse_cypher(`. |
| 3 | `wal_reader_target_source_exists` | `crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_wal_record_reader.rs` exists and contains `fuzz_target!`, `ogdb_core::Database::init(`, `ogdb_core::Database::open(`, and `tempfile::`. |
| 4 | `fuzz_cargo_toml_registers_both_bins` | `crates/ogdb-fuzz/fuzz/Cargo.toml` parses as TOML and has two `[[bin]]` entries whose `name` fields are `"fuzz_cypher_parser"` and `"fuzz_wal_record_reader"` (order-insensitive). |
| 5 | `readme_documents_invocation` | `crates/ogdb-fuzz/README.md` exists and contains the exact string `cargo +nightly fuzz run fuzz_cypher_parser` and `cargo +nightly fuzz run fuzz_wal_record_reader`. |

Why these five cover the deliverable:

- **#1** locks in the nested-workspace shape cargo-fuzz expects.
- **#2 and #3** lock in the data-flow contract from §3 — specifically
  that the harness actually calls the function we claim it calls, so a
  refactor that accidentally stubs the body to `{}` turns the test red.
- **#4** locks in that both targets are discoverable via
  `cargo fuzz list` — cargo-fuzz reads the nested `Cargo.toml` to find
  them. If someone adds a third target but forgets the bin stanza,
  this test flags it only to the extent it matches the existing two
  (deliberate — third targets are out of scope for this plan).
- **#5** locks in the README entry-point documentation that
  deliverable (e) requires. Without it, a user who clones the repo has
  no way to discover the fuzz harness.

The **RED state**: the tests live in the file but fail because
`crates/ogdb-fuzz/fuzz/` does not exist yet in this commit. Reproducer:

```bash
cd ~/opengraphdb
cargo test -p ogdb-fuzz --test targets_compile 2>&1 | tail -20
# compiles (stub lib + test file exist); 5 tests run; 5 FAIL
# each with "path does not exist" message pointing at
# crates/ogdb-fuzz/fuzz/{…}
```

### 4.1 Why the tests live in a stub crate (vs. nothing until GREEN)

If we commit only `PLAN.md` and no crate shell, the RED command would
be `cargo test -p ogdb-fuzz …` → "package `ogdb-fuzz` not found in
workspace" — a fatal resolver error rather than a test failure. That's
a weaker RED because it can't be reached via the normal
`cargo test --workspace` sweep CI runs. Committing a minimal shell
(`Cargo.toml` + `src/lib.rs` with zero public items + workspace
registration) gives us **meaningful, collectable test failures**: the
tests compile, run, and fail loudly on a specific missing file path.
That turns the GREEN check into "run the same command; all 5 pass".

The shell crate has **zero runtime cost**: `src/lib.rs` is empty, no
production code depends on it, and nothing loads it. The shell Cargo
manifest declares the stable dev-deps (`tempfile`, `toml`) the tests
need so the RED → GREEN transition doesn't touch `Cargo.toml` again.

## 5. Implementation sketch (Phases 3–5 GREEN) — ~60 lines total

### 5.1 Nested cargo-fuzz crate (Phase 3)

cargo-fuzz requires a sub-workspace. Create at
`crates/ogdb-fuzz/fuzz/Cargo.toml`:

```toml
[package]
name = "ogdb-fuzz-targets"
version = "0.0.0"
publish = false
edition = "2021"

[package.metadata]
cargo-fuzz = true

[dependencies]
libfuzzer-sys = "0.4"
ogdb-core = { path = "../../ogdb-core" }
tempfile = "3"

# Prevent this crate from being picked up by the parent workspace.
[workspace]

[[bin]]
name = "fuzz_cypher_parser"
path = "fuzz_targets/fuzz_cypher_parser.rs"
test = false
doc = false

[[bin]]
name = "fuzz_wal_record_reader"
path = "fuzz_targets/fuzz_wal_record_reader.rs"
test = false
doc = false
```

The empty `[workspace]` key is the documented cargo-fuzz trick to make
the nested crate its own workspace so it won't inherit lints/deps from
the outer workspace. Reference: https://rust-fuzz.github.io/book/cargo-fuzz/tutorial.html §"cargo fuzz init".

### 5.2 Cypher parser target (Phase 4)

`crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_cypher_parser.rs`:

```rust
#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    // parse_cypher takes &str. Non-UTF-8 inputs are a different fuzzer's
    // problem (bytes → str conversion is not part of the parser contract).
    let Ok(s) = std::str::from_utf8(data) else { return };

    // We only care about panics / aborts / infinite loops. Any Result
    // return value, Ok or Err, is acceptable — the parser is allowed to
    // reject adversarial input; it is not allowed to panic.
    let _ = ogdb_core::parse_cypher(s);
});
```

### 5.3 WAL record reader target (Phase 4)

`crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_wal_record_reader.rs`:

```rust
#![no_main]

use libfuzzer_sys::fuzz_target;
use ogdb_core::{Database, Header};

fuzz_target!(|data: &[u8]| {
    // Hermetic: each iteration gets a fresh tempdir. See PLAN §3.2
    // for why this is per-iter, not per-process.
    let tmp = match tempfile::tempdir() {
        Ok(t) => t,
        Err(_) => return, // filesystem flake is not the parser's fault
    };
    let db_path = tmp.path().join("fuzz.ogdb");

    // Produce a valid sidecar set via the public init API. If this
    // ever fails on a fresh tempdir, that's a bug in ogdb-core worth
    // investigating separately — for now we bail and let libFuzzer
    // mutate again.
    let db = match Database::init(&db_path, Header::default_v1()) {
        Ok(db) => db,
        Err(_) => return,
    };
    let wal = db.wal_path();
    drop(db); // release file handles before overwriting the WAL

    if std::fs::write(&wal, data).is_err() {
        return;
    }

    // Feed the fuzz bytes through the real public replay path.
    // Ok(db) | Err(DbError::Corrupt) | Err(DbError::Io) are all fine;
    // a panic is the bug.
    let _ = Database::open(&db_path);
});
```

### 5.4 README + seed corpora (Phase 5)

`crates/ogdb-fuzz/README.md`:

````markdown
# ogdb-fuzz — libFuzzer targets for ogdb-core

Two fuzz targets cover the two highest-risk untrusted-input paths in
ogdb-core:

| Target | Input | Entry point | Accept | Reject |
|--------|-------|-------------|--------|--------|
| `fuzz_cypher_parser` | `&str` (Cypher text) | `ogdb_core::parse_cypher` | `Ok` / `Err` | `panic!` |
| `fuzz_wal_record_reader` | `&[u8]` (raw WAL bytes) | `ogdb_core::Database::open` on a tempdir with the bytes written as the WAL | `Ok` / `Err(DbError::Corrupt)` / `Err(DbError::Io)` | `panic!` |

## Prerequisites

```bash
rustup toolchain install nightly
cargo install cargo-fuzz
```

## Run

```bash
cd crates/ogdb-fuzz

# List discovered targets (sanity check).
cargo +nightly fuzz list

# Run the Cypher parser fuzz loop (Ctrl-C to stop; crashes land under
# fuzz/artifacts/fuzz_cypher_parser/).
cargo +nightly fuzz run fuzz_cypher_parser

# Run the WAL reader fuzz loop.
cargo +nightly fuzz run fuzz_wal_record_reader

# Time-boxed 60s smoke run (CI-equivalent spot-check).
cargo +nightly fuzz run fuzz_cypher_parser -- -max_total_time=60
cargo +nightly fuzz run fuzz_wal_record_reader -- -max_total_time=60
```

## Seed corpora

Seeds live under `fuzz/corpus/<target>/`. They are not required —
libFuzzer will synthesise inputs from scratch — but good seeds cut the
time-to-first-interesting-coverage dramatically.

### `fuzz_cypher_parser` seeds

Drop the canonical queries from `crates/ogdb-core/src/lib.rs` test
helpers into `fuzz/corpus/fuzz_cypher_parser/`:

- `MATCH (n) RETURN n`
- `MATCH (n:Person) WHERE n.age > 18 RETURN n`
- `CREATE (n:Person {name: 'Bob', age: 30})`
- `MATCH (a)-[r:KNOWS*1..3]->(b) RETURN b`
- `UNWIND [1, 2, 3] AS x RETURN x`
- `MERGE (n:User {id: 1}) ON CREATE SET n.created_at = timestamp()`

One per file, no trailing newline required.

### `fuzz_wal_record_reader` seeds

Grab a valid WAL file from any test DB:
```bash
./target/debug/ogdb init /tmp/seed.ogdb
./target/debug/ogdb query /tmp/seed.ogdb 'CREATE (n:Person {name: "a"})'
cp /tmp/seed.ogdb-wal crates/ogdb-fuzz/fuzz/corpus/fuzz_wal_record_reader/valid.bin
```

Also drop the short malformed WALs the existing unit tests use:
- `[1u8, 2u8, 3u8]` → "shorter than header"
- `b"BADWAL00"` → "invalid magic"
- `b"OGWAL001\xff"` → "unknown record type"

## Reproducing a crash

```bash
cargo +nightly fuzz run <target> fuzz/artifacts/<target>/crash-<sha>
```

The binary blob in that file is the exact `&[u8]` libFuzzer passed the
target. Commit the blob to the corpus so the crash is regression-tested
on every future fuzz run.
````

Create empty `fuzz/corpus/fuzz_cypher_parser/` and
`fuzz/corpus/fuzz_wal_record_reader/` directories (with `.gitkeep` if
required by the team's convention) so the paths cargo-fuzz writes to
pre-exist.

## 6. Scope

- **Touched files (RED commit):**
  - `.planning/fuzzing-harness/PLAN.md` (this file, ~400 lines)
  - `crates/ogdb-fuzz/Cargo.toml` (new, ~15 lines — stub manifest
    with dev-deps `tempfile`, `toml` for the existence tests)
  - `crates/ogdb-fuzz/src/lib.rs` (new, 0 non-doc lines)
  - `crates/ogdb-fuzz/tests/targets_compile.rs` (new, ~90 lines)
  - `Cargo.toml` (workspace members: add `crates/ogdb-fuzz`, 1 line)
- **Touched files (GREEN commits, Phases 3–5):**
  - `crates/ogdb-fuzz/fuzz/Cargo.toml` (new, nested sub-workspace)
  - `crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_cypher_parser.rs` (new)
  - `crates/ogdb-fuzz/fuzz/fuzz_targets/fuzz_wal_record_reader.rs`
    (new)
  - `crates/ogdb-fuzz/README.md` (new)
  - `crates/ogdb-fuzz/fuzz/corpus/<target>/.gitkeep` (new, empty)
- **NOT touched:**
  - `crates/ogdb-core/**` (parser and WAL reader consumed as
    libraries — the scope constraint in the original request is
    explicit on this; any panic fixes found by fuzzing belong on their
    own branches under `plan/fix-cypher-panic-X`,
    `plan/fix-wal-panic-Y`, …)
  - All other crates (`ogdb-cli`, `ogdb-bolt`, `ogdb-e2e`,
    `ogdb-bench`, `ogdb-eval`, `ogdb-tck`, `ogdb-ffi`,
    `ogdb-python`, `ogdb-node`).
  - Root CI config (`.github/workflows/*`) — running fuzz in CI is
    out of scope; local-only per the user's ask.
- **No new feature flags.** cargo-fuzz's nested workspace is the
  feature-flag substitute — stable builds never compile the fuzz
  targets.
- **Per-crate tests only.** `cargo test -p ogdb-fuzz --test
  targets_compile` is the single verification command for CI. The
  workspace-wide sweep (`cargo test --workspace`) also covers it as a
  side effect because `ogdb-fuzz` is a workspace member.

## 7. 8-phase TDD breakdown

| Phase | Deliverable | Verification |
|-------|-------------|--------------|
| 1 | Context reading + data-flow trace (this doc §3) | PR review |
| 2 | RED — this PLAN.md + stub crate + failing `targets_compile.rs` | `cargo test -p ogdb-fuzz --test targets_compile` → all 5 tests FAIL with "path does not exist" messages |
| 3 | GREEN — create `crates/ogdb-fuzz/fuzz/Cargo.toml` + `fuzz_targets/` dir | Tests #1 and #4 go green |
| 4 | GREEN — write `fuzz_cypher_parser.rs` + `fuzz_wal_record_reader.rs` | Tests #2 and #3 go green |
| 5 | GREEN — write `crates/ogdb-fuzz/README.md` + seed-corpus dirs | Test #5 green; all 5 green |
| 6 | Local smoke — `cd crates/ogdb-fuzz && cargo +nightly fuzz run fuzz_cypher_parser -- -max_total_time=60` | libFuzzer banner appears; runs 60s; no crashes OR crash landed under `fuzz/artifacts/` and documented in CHANGELOG as a follow-up bug to be fixed on its own branch |
| 7 | Local smoke — same for `fuzz_wal_record_reader` | Same acceptance criteria |
| 8 | `CHANGELOG.md` entry under `## [Unreleased]`; `docs/IMPLEMENTATION-LOG.md` entry | `scripts/changelog-check.sh` and `scripts/workflow-check.sh` pass |

## 8. Open questions (resolved)

- **Q1.** Can we fuzz the WAL reader directly without `Database::open`?
  **Resolution:** no — `recover_from_wal_bytes` at
  `crates/ogdb-core/src/lib.rs:22303` is private (`fn`, not `pub fn`).
  Making it public would violate the scope constraint ("do NOT touch
  ogdb-core"). The `Database::init` + overwrite-WAL + `Database::open`
  pattern is the supported public path and exercises the same byte
  parser. The ~2 ms tempdir overhead is acceptable for fuzzing.
- **Q2.** Why not also fuzz `parse_cypher` through `Database::parse_cypher`?
  **Resolution:** the thin wrapper at line 13102 just forwards to the
  free function at line 6651. Fuzzing the free function avoids
  per-iter `Database` construction overhead (~10 ms) for zero added
  coverage.
- **Q3.** Why `#![no_main]` and `libfuzzer-sys` instead of afl /
  honggfuzz? **Resolution:** `cargo-fuzz` is the de facto standard in
  the Rust ecosystem and is what the user's request names. libFuzzer
  also integrates with `#[cfg(fuzzing)]` sanitizer flags that `cargo
  fuzz` sets automatically (ASan, optional MSan). honggfuzz is
  acceptable but would double the surface area we maintain.
- **Q4.** Does the stub `ogdb-fuzz` Cargo.toml need `publish = false`?
  **Resolution:** yes — the crate exists only for fuzzing and
  CI-compile checks; publishing would confuse crates.io users. Both
  the outer `crates/ogdb-fuzz/Cargo.toml` and the inner
  `crates/ogdb-fuzz/fuzz/Cargo.toml` set `publish = false`.
- **Q5.** Why `toml` as a dev-dep on the outer crate? **Resolution:**
  the RED test #4 parses the nested `fuzz/Cargo.toml` to assert the
  two `[[bin]]` entries. A hand-rolled substring check would false-
  positive on comments. Using `toml` (stable, zero-feature) keeps the
  assertion precise.
- **Q6.** What about `cargo fuzz cmin` / corpus minimisation? Do we
  document it? **Resolution:** not in the README. It's a power-user
  workflow and documenting it risks making the README look like a
  fuzzing tutorial instead of a quickstart. Engineers who need it can
  read `cargo fuzz --help`.
- **Q7.** Seed corpora quality vs. CI cost. **Resolution:** we commit
  ~10 tiny seeds per target (<4 KB total). libFuzzer's own corpus
  accumulates to disk during runs but is in `fuzz/corpus/<target>/`
  which we don't gitignore — we want crashes and their reproducers
  tracked, but the ambient corpus can grow. A follow-up may add a
  `.gitignore` rule to cap what's tracked.
