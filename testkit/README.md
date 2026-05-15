# TestKit — cross-binding parity harness

TestKit runs the **same Cypher corpus** through **every query surface**
OpenGraphDB ships (CLI, HTTP, MCP, eventually Bolt + Python + Node + FFI)
and diffs the results after a documented normalization pass. The goal is
to gate **semantic parity** on the data path: same Cypher in → same logical
rows out, regardless of which adapter typed it.

This is Phase 1 of the 8-step rollout (see
`documentation/.research/testkit-design-2026-05-08.md` on
`plan/testkit-harness-design` for the full design). Phase 1 scope:

- 10 starter YAML entries in `corpus/v1/` (4 cypher-engine regression
  pins, basic CRUD × 2, traversal, aggregation, temporal `AT TIME`,
  vector kNN).
- Python driver `driver/run_corpus.py` exercising the CLI and HTTP
  surfaces; the MCP adapter is a placeholder until Phase 2.
- `.github/workflows/testkit.yml` — scheduled nightly + manual
  dispatch; **not required** on PRs (8-step rollout starts as "soak for
  2 weeks").

Bolt, embedded Python (`ogdb-python`), Node (`ogdb-node`), and the C FFI
adapter land in Phase 2.

## Layout

```
testkit/
├── corpus/
│   └── v1/                          # 10 starter YAML entries
├── driver/
│   └── run_corpus.py                # Python driver (PyYAML only)
└── README.md
```

## Running locally

Requires Python 3.10+ and PyYAML. The driver shells out to the `ogdb`
binary; build it first if you don't have a release build:

```bash
cargo build --release -p ogdb-cli      # or `cargo build -p ogdb-cli`
pip install pyyaml                     # if not already installed
```

By default the driver looks for `target/release/ogdb` from the repo
root. Override with `OGDB_BIN=/path/to/ogdb`.

Run the full corpus on the Phase-1 surfaces:

```bash
cd testkit
python3 driver/run_corpus.py --surfaces cli,http --corpus corpus/v1/
```

Add `--strict` to fail the run on any non-pass result (default behavior
is to print results and exit 0 — Phase 1 soak mode).

## Adding a corpus entry

Every entry is a single YAML file in `corpus/v1/`. Minimum schema:

```yaml
id: <stable-kebab-id>          # used in CI reports
description: |
  One-paragraph human prose; first sentence is shown in run output.
tags: [crud, smoke]            # filterable (Phase 2)

fixture: |
  CREATE (n:Foo {x: 1});       # statements split on `;`
  CREATE (m:Bar {y: 2})        # applied once before the cypher block

cypher: |
  MATCH (n:Foo) RETURN n.x AS x

expect:
  ordered: false               # default false — multiset compare
  columns: [x]
  rows:
    - [1]
```

Optional fields:

- `skip.<surface>: {reason, issue}` — hard skip on a single surface
  with an issue link. Requires `Drift-Approved: <link>` in the PR
  description once the drift-ratchet gate lands (Phase 2 of CI wiring).
- `known_drift.<surface>: {reason, normalization}` — surface-specific
  normalization to apply before comparing. Used sparingly; each waiver
  must be deliberate and linked to a tracking issue.

### Convention

- File names: `<category>-<seq>-<short-name>.yaml`. Categories: `crud`,
  `traversal`, `aggregation`, `temporal`, `vector`, plus
  `cypher-fix-<id>` for regression pins.
- Keep one assertion per file. Diffs stay readable and a flake on one
  test doesn't blow away the run output.

## Normalization

The driver applies a small set of normalizers before comparing rows so
documented wire-format drifts don't show up as parity failures:

| normalizer | applies to | what it does |
|---|---|---|
| `strip_typed_prefix` | cli | `"i64:1"` → `1`, `"str:foo"` → `"foo"`, etc. |
| `coerce_floats` | all | round f64 to 6 sig figs for compare |
| _(more land in Phase 2)_ | | `coalesce_empty_result`, `strip_mcp_envelope`, `sort_node_labels`, … |

Raw responses are preserved on `Result.raw` so failure reports show
both normalized and untouched output — a reviewer can decide whether
the failure is a harness bug or a real drift.

## CI

`.github/workflows/testkit.yml` runs the full corpus on:

- Nightly schedule (`cron: 0 6 * * *` UTC) against `main`.
- `workflow_dispatch` for manual triage.

It is **not required** on PRs during the Phase 1 soak. The 8-step
rollout flips the status check to required after a 2-week green run.

## Roadmap

Phase 1 (this scaffold):

- [x] 10 starter entries
- [x] CLI + HTTP adapters
- [x] MCP placeholder
- [x] Nightly CI

Phase 2:

- [ ] MCP stdio + MCP HTTP adapters
- [ ] Bolt adapter (`neo4j` Python driver against `ogdb-bolt`)
- [ ] `pyembed` adapter (`ogdb-python` in-process)
- [ ] `nodebind` adapter
- [ ] `ffi` adapter (ctypes against `libogdb.so`)
- [ ] Drift-ratchet script + `Drift-Approved:` gate
- [ ] PR comment integration
- [ ] Flip `testkit / parity` to required

Phase 3:

- [ ] Expand corpus to the full 28 entries (see design doc)
- [ ] Fixture-name reuse (`fixture: movielens-tiny` → shared `00-fixtures/`)
- [ ] Markdown failure-report artifact per run
