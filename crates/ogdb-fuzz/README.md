# ogdb-fuzz — libFuzzer targets for ogdb-core

Two fuzz targets cover the two highest-risk untrusted-input paths in
`ogdb-core`:

| Target | Input | Entry point | Accept | Reject |
|--------|-------|-------------|--------|--------|
| `fuzz_cypher_parser` | `&str` (Cypher query text) | `ogdb_core::parse_cypher` | `Ok` / `Err` | `panic!` |
| `fuzz_wal_record_reader` | `&[u8]` (raw `.ogdb-wal` bytes) | `ogdb_core::Database::open` on a tempdir whose WAL file is overwritten with the fuzz input | `Ok` / `Err(DbError::Corrupt)` / `Err(DbError::Io)` | `panic!` |

See `.planning/fuzzing-harness/PLAN.md` for the full rationale and
data-flow trace.

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

# Run the Cypher parser fuzz loop. Ctrl-C to stop; crashes land under
# fuzz/artifacts/fuzz_cypher_parser/.
cargo +nightly fuzz run fuzz_cypher_parser

# Run the WAL reader fuzz loop.
cargo +nightly fuzz run fuzz_wal_record_reader

# Time-boxed 60s smoke run (CI-equivalent spot-check).
cargo +nightly fuzz run fuzz_cypher_parser -- -max_total_time=60
cargo +nightly fuzz run fuzz_wal_record_reader -- -max_total_time=60
```

## Why stable CI does not run the fuzz targets

`cargo-fuzz` requires the nightly toolchain and sanitizer runtime
(`-Zsanitizer=address`). The fuzz crate is a nested sub-workspace at
`crates/ogdb-fuzz/fuzz/` with its own `[workspace]` root, which means a
normal `cargo build` / `cargo check` at the repo root **never** compiles
the fuzz targets. The stable-build compile-check test at
`crates/ogdb-fuzz/tests/targets_compile.rs` verifies file layout and
`Cargo.toml` shape only, so CI stays stable-only and fast.

## Seed corpora

Seeds live under `fuzz/corpus/<target>/`. They are not required —
libFuzzer will synthesise inputs from scratch — but good seeds cut the
time-to-first-interesting-coverage dramatically.

### `fuzz_cypher_parser` seeds

One file per canonical query (no trailing newline required). The
committed set covers read/write/path/unwind/merge shapes so the fuzzer
starts with coverage of the hot branches of `parse_cypher`.

### `fuzz_wal_record_reader` seeds

Committed seeds include a valid empty WAL (magic-only), a WAL with a
`CREATE_NODE` v1 record, and the short malformed WALs the
`ogdb-core` unit tests pin (shorter-than-header, bad magic, unknown
record tag). To drop in a real-world WAL from a scratch database:

```bash
cargo run -p ogdb-cli -- init /tmp/seed.ogdb
cargo run -p ogdb-cli -- query /tmp/seed.ogdb 'CREATE (n:Person {name: "a"})'
cp /tmp/seed.ogdb-wal crates/ogdb-fuzz/fuzz/corpus/fuzz_wal_record_reader/real-world-create.bin
```

## Reproducing a crash

```bash
cargo +nightly fuzz run <target> fuzz/artifacts/<target>/crash-<sha>
```

The binary blob in that file is the exact `&[u8]` libFuzzer passed the
target. Commit the blob to the corpus so the crash becomes a regression
test on every future fuzz run.
