# OpenGraphDB TDD Methodology

This repository uses strict test-first development for production code paths.

## Core Loop

1. Write a failing test that defines behavior.
2. Implement the smallest change that makes the test pass.
3. Refactor with tests still green.
4. Update implementation log, changelog, and decision docs.

## Mandatory Rules

- No feature code without tests in the same change.
- Every CLI behavior change must include CLI tests.
- Every storage format change must include decode/encode and recovery tests.
- Documentation must be updated in the same change when behavior or decisions change.
- `CHANGELOG.md` must be updated under `Unreleased` for every completed change.
- `CHANGELOG.md` `Unreleased` section must contain at least one bullet (checked by `scripts/workflow-check.sh`).
- CI must remain green for `scripts/test.sh` and `scripts/coverage.sh`.

## Coverage Policy

- Target: 100% line coverage for crates under active implementation.
- Gate command:

```bash
source "$HOME/.cargo/env"
cargo llvm-cov --package ogdb-core --package ogdb-cli --lib --fail-under-lines 100
```

Current active crates for strict coverage gate:
- `ogdb-core`
- `ogdb-cli`

- If coverage tooling is unavailable locally, run at minimum:

```bash
source "$HOME/.cargo/env"
cargo test --workspace --all-targets
```

and record the coverage gap in `CHANGELOG.md` under `Unreleased`.

## Documentation Sources of Truth

- Architecture decisions: `ARCHITECTURE.md`
- Versioning policy: `docs/VERSIONING.md`
- Canonical changelog: `CHANGELOG.md`
- Implementation readiness and gates: `IMPLEMENTATION-READY.md`
- Benchmark outcomes and policy: `BENCHMARKS.md`
- PR checklist template: `.github/PULL_REQUEST_TEMPLATE.md`
