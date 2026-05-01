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

- **Current ratchet:** 93% line coverage, ≤ 3000 uncovered lines (the floors declared in [`../scripts/coverage.sh`](../scripts/coverage.sh)). The ratchet ratchets DOWN as coverage grows — it never ratchets UP. New code must not regress the ratchet.
- **Aspirational target:** 100% on the public API of `ogdb-core` and `ogdb-cli` — but the gate enforces the ratchet, not the aspiration. Treat 100% as a long-run direction, not a release blocker.
- **Gate command** (the same command CI runs):

```bash
source "$HOME/.cargo/env"
./scripts/coverage.sh
```

Crates under the strict ratchet:
- `ogdb-core`
- `ogdb-cli`

- If coverage tooling is unavailable locally, run at minimum:

```bash
source "$HOME/.cargo/env"
cargo test --workspace --all-targets
```

and record the coverage gap in `CHANGELOG.md` under `Unreleased`. Do not invoke `cargo llvm-cov ... --fail-under-lines 100` directly — that command predates the ratchet and will fail every run; older drafts of this file printed it as the gate, which contradicted `CONTRIBUTING.md` and led contributors to red builds.

## Documentation Sources of Truth

- Architecture decisions: `../ARCHITECTURE.md`
- Versioning policy: `VERSIONING.md`
- Canonical changelog: `../CHANGELOG.md`
- Implementation readiness and gates: `../IMPLEMENTATION-READY.md`
- Benchmark outcomes and policy: `../documentation/BENCHMARKS.md`
- PR checklist template: `../.github/PULL_REQUEST_TEMPLATE.md`
