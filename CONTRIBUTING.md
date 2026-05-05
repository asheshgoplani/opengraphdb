# Contributing to OpenGraphDB

Thanks for your interest. OpenGraphDB is an embeddable Cypher graph database written in Rust, Apache-2.0 licensed.

## Before You Start

Please read the following in order:

1. `ARCHITECTURE.md` — canonical, locked technical decisions. If there is a conflict between docs, this wins.
2. `DESIGN.md` — byte-level and subsystem design.
3. `SPEC.md` — product and interface specification.
4. `AGENTS.md` — required delivery workflow (tests first, full validation, changelog entry).

## Workflow (non-optional)

Implementation is test-first and log-driven. Every completed change must:

1. Add or update failing tests first.
2. Implement the smallest change that makes tests pass.
3. Run `./scripts/test.sh` and `./scripts/coverage.sh`.
4. Update behavior/architecture docs if behavior changed.
5. Add a `## [Unreleased]` entry in `CHANGELOG.md`.

`scripts/changelog-check.sh` and `scripts/workflow-check.sh` enforce the last two.

## Build / Test

```bash
cargo build
cargo test
cargo clippy --workspace -- -D warnings
cargo fmt --all
```

Per-crate cargo is the safe default; avoid workspace-wide rebuilds on large changes.

The repo ships convenience scripts:

```bash
./scripts/test.sh             # full test suite
./scripts/changelog-check.sh  # validate CHANGELOG.md structure
./scripts/coverage.sh         # strict active-crate coverage gate
```

## Coverage Gate

Coverage gate (declared in `scripts/coverage.sh`): **80% line coverage, ≤ 5000 uncovered lines** workspace-wide, excluding the harness crates `ogdb-bench`, `ogdb-e2e`, `ogdb-eval`, `ogdb-fuzz`, and `ogdb-tck`. The threshold was lowered from the prior 93%/3000 ogdb-core/cli value when the monolith split landed and the new split crates shipped with minimal tests; raising it back up is tracked as M14. The gate ratchets in only one direction — **DOWN never up** — so coverage growth is locked in and never given back. The gate command:

```bash
source "$HOME/.cargo/env"
./scripts/coverage.sh
```

If coverage tooling is unavailable locally, run at minimum `cargo test --workspace --all-targets` and record the coverage gap in `CHANGELOG.md` under `Unreleased`.

Method and policy detail: [`docs/TDD-METHODOLOGY.md`](docs/TDD-METHODOLOGY.md). Release/version policy: [`docs/VERSIONING.md`](docs/VERSIONING.md).

## TCK Harness

Run the openCypher TCK harness against a local checkout of the TCK repository:

```bash
source "$HOME/.cargo/env"
cargo run --release -p ogdb-tck -- /path/to/openCypher/tck --floor 0.50
```

The harness parses `.feature` files, executes supported scenario query steps via `Database::query(...)`, and reports pass/fail/skip plus Tier-1 category coverage.

## Benchmark Harness

The competitive baseline lives at [`documentation/BENCHMARKS.md`](documentation/BENCHMARKS.md). To reproduce:

```bash
source "$HOME/.cargo/env"
cd crates/ogdb-eval
OGDB_EVAL_BASELINE_JSON=/tmp/baseline.json \
OGDB_EVAL_BASELINE_ITERS=5 \
  cargo test --release --test publish_baseline -- --nocapture
```

## Bug Reports and PRs

- Open an issue describing the bug, expected behavior, and a minimal reproducer.
- For PRs: reference the issue, include the regression test, and keep the diff focused.
- Destructive git operations (force-push, reset --hard on shared branches) are not accepted.

## CI and Review Policy

- `.github/workflows/ci.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

## Scope

OpenGraphDB's priorities (in order): storage correctness → traversal latency → Cypher correctness → import/export fidelity → observability → AI access surfaces. Contributions outside this ordering are welcome but may be deprioritized for review.

## Areas We Need Help With

- Storage engines (buffer pools, WAL, crash recovery)
- Query engines (parsing, optimization, execution)
- Rust systems programming
- Vector search / HNSW
- RDF and knowledge graphs
- AI agent tooling / MCP
- Developer experience and documentation

## License

By contributing, you agree your contributions are licensed under Apache-2.0 (see `LICENSE`).
