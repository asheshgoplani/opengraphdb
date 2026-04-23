# Contributing to OpenGraphDB

Thanks for your interest. OpenGraphDB is an embeddable Cypher graph database written in Rust, Apache-2.0 licensed.

## Before You Start

Please read the following in order:

1. `ARCHITECTURE.md` — canonical, locked technical decisions. If there's a conflict between docs, this wins.
2. `DESIGN.md` — byte-level and subsystem design.
3. `SPEC.md` — product and interface specification.
4. `AGENTS.md` — required delivery workflow (tests first, full validation, changelog entry).

## Workflow (non-optional)

Every completed change must:

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

## Bug Reports and PRs

- Open an issue describing the bug, expected behavior, and a minimal reproducer.
- For PRs: reference the issue, include the regression test, and keep the diff focused.
- Destructive git operations (force-push, reset --hard on shared branches) are not accepted.

## Scope

OpenGraphDB's priorities (in order): storage correctness → traversal latency → Cypher correctness → import/export fidelity → observability → AI access surfaces. Contributions outside this ordering are welcome but may be deprioritized for review.

## License

By contributing, you agree your contributions are licensed under Apache-2.0 (see `LICENSE`).
