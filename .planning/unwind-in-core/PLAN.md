# unwind-in-core — promote UNWIND from CLI-level string desugar to a real physical operator in ogdb-core

> **Phase 2 artifact.** This document + the failing tests under
> `crates/ogdb-core/tests/unwind_*.rs` and
> `crates/ogdb-cli/tests/http_post_query_accepts_unwind.rs` constitute the
> RED commit on branch `plan/unwind-in-core`. Phases 3–5 (GREEN) add a
> `PhysicalUnwind` operator, fix the `build_physical_plan` stub, and then
> delete the CLI string-level desugar. Phases 6–8 are coverage + docs.

**Goal:** make `UNWIND` work end-to-end through the core query engine —
over the CLI, over the embedded `Database::query` API, and over HTTP
`POST /query` — **without** the CLI string-rewriting hack that exists
today. Support all four shapes required by openCypher: list literal
(`UNWIND [1,2,3] AS i`), two-arg range (`UNWIND range(A,B) AS i`),
three-arg range with step (`UNWIND range(A,B,step) AS i`), and list
properties read off bound nodes (`MATCH (n) UNWIND n.tags AS t`). Empty
lists must yield zero output rows. The existing regression contract
`UNWIND range(1,7) AS i CREATE (:Person {id: i})` persists 7 nodes
must still hold after the CLI desugar is removed.

**Tech stack:** Rust 2021, `ogdb-core` parser + planner + executor only.
Cargo.toml, WAL, storage, vector index, bindings, and server transport
code are untouched. `crates/ogdb-cli/src/lib.rs` is touched only to
delete the now-dead desugar in Phase 5.

---

## 1. Problem summary — why the CLI desugar is a layer violation

Today `UNWIND` "works" when you shell into the CLI with a very specific
query shape, because `crates/ogdb-cli/src/lib.rs` intercepts the query
string *before* it ever reaches the core engine and rewrites it into
a sequence of simpler queries the core can handle:

```rust
// crates/ogdb-cli/src/lib.rs:1880–1909
// UNWIND is not yet wired through the physical planner, so a query like
// `UNWIND range(1,100) AS i CREATE (:Person {id: i})` errors out in core
// and nothing gets persisted. Until the planner learns UNWIND, the CLI
// desugars the specific `UNWIND range(A, B) AS <var> <rest>` shape into
// B-A+1 simple CREATE statements by substituting <var> with each literal
// value.
fn try_expand_unwind_range_create(query: &str) -> Option<Vec<String>> {
    let rest = consume_keyword(query.trim(), "UNWIND")?;
    let rest = consume_keyword(rest.trim_start(), "range")?;
    // … parse (A, B) AS <var> <rest> …
    let mut queries = Vec::with_capacity((end - start + 1) as usize);
    for i in start..=end {
        queries.push(substitute_identifier_literal(body, &var, &i.to_string()));
    }
    Some(queries)
}
```

Called from `execute_query_rows` at `crates/ogdb-cli/src/lib.rs:2006`
and `execute_query` at `:2029`, both of which are the *CLI-subcommand*
code paths (`ogdb query <db> "..."`).

### 1.1 Why this is a layer violation

1. **HTTP `POST /query` never calls it.** The HTTP handler at
   `crates/ogdb-cli/src/lib.rs:4552` takes the JSON body's `query`
   string and hands it straight to
   `shared_db.query_cypher_as_user_with_retry` — which calls
   `Database::query` — which calls the core parser/planner/executor.
   No CLI desugar on this path. So the same Cypher that "works" via
   `ogdb query <db> "UNWIND range(1,7) AS i CREATE (...)"` returns
   `physical planning for UNWIND is not implemented yet` via
   `curl -X POST .../query -d '{"query":"UNWIND range(1,7) AS i CREATE (...)"}'`.
2. **Shape coverage is narrow.** The desugar recognises *only*
   `UNWIND range(A, B) AS <var> <body>`. It does **not** handle:
   - three-arg range — `UNWIND range(0, 10, 2) AS i ...`
   - list literal — `UNWIND [1, 2, 3] AS i ...`
   - stored list properties — `UNWIND n.tags AS t ...`
   - nested expressions on the RHS — `UNWIND range(1, size(xs)) AS i`

   Each failing shape falls through to core, which fails with the same
   stub error. Users silently hit the CLI/HTTP split line and get
   different results for the same Cypher, depending on which transport
   they used.
3. **Identifier substitution is semantically wrong.** The desugar uses
   `substitute_identifier_literal` — a string-level whole-word replace
   skipping quoted segments. It will rewrite `{id: i}` into `{id: 1}`
   correctly, but it does NOT understand Cypher scoping: if the body
   happens to use the loop variable as a *property name* (e.g.
   `{key_${i}: 1}` patterns) or inside a backtick-quoted identifier,
   substitution produces nonsense. It also can't reason about nested
   UNWIND or UNWIND after MATCH, because the "rest" is treated as
   opaque text.
4. **Other bindings skip the desugar too.** `crates/ogdb-node`,
   `crates/ogdb-python`, `crates/ogdb-ffi`, `crates/ogdb-bolt`, and the
   MCP surface all route through `Database::query` as well — none of
   them pick up the CLI rewrite. So any user of the Rust/Node/Python
   API or a Bolt/MCP client sees the stub error.

The real fix is to make UNWIND a first-class operator in the core
query engine. Then every transport — CLI, HTTP, Bolt, gRPC, MCP,
embedded, Node, Python, FFI — gets it for free with zero transport-
layer code.

### 1.2 What the core engine already understands about UNWIND

Good news: the parser and logical planner already accept UNWIND. The
gap is tiny — it's one stub in physical planning. Concretely at the
head of `plan/unwind-in-core` (HEAD = `cc63103`):

| Stage            | Status | Location |
|------------------|--------|----------|
| Lexer keyword    | ✅     | `crates/ogdb-core/src/lib.rs:6777` — `"UNWIND" => Some(CypherKeyword::Unwind)` |
| Parser clause    | ✅     | `:6869–6870` (dispatch), `:7044–7050` (`parse_unwind_clause`) |
| AST clause enum  | ✅     | `CypherClause::Unwind(UnwindClause)` at `:1731`; struct `UnwindClause { expression, variable }` at `:1787` |
| Logical op       | ✅     | `LogicalPlan::UnwindList { input, expression, variable }` at `:2185` |
| Logical build    | ✅     | `CypherClause::Unwind(value) => LogicalPlan::UnwindList { … }` at `:3167–3171` |
| Output columns   | ✅     | `logical_plan_output_columns` handles `UnwindList` at `:3299–3310` (input columns ∪ `{variable}`) |
| Physical op      | ❌     | **no `PhysicalUnwind` variant in `PhysicalPlan` enum (`:2231–2374`)** |
| Physical build   | ❌     | `build_physical_plan` returns `PlanError::new("physical planning for UNWIND is not implemented yet")` at `:4934–4936` |
| Executor         | ❌     | no branch in `execute_physical_plan_batches` (`:14322+`) or the traced variant (`:15143+`) |

List-expression evaluation is *already* plumbed through the executor,
so `PhysicalUnwind` has nothing to invent:

- `CypherExpression::ListLiteral` evaluates to
  `RuntimeValue::Property(PropertyValue::List(…))` at
  `crates/ogdb-core/src/lib.rs:16233–16242`.
- `range(start, end)` and `range(start, end, step)` return
  `RuntimeValue::Property(PropertyValue::List(Vec<PropertyValue::I64>))`
  at `:15835–15873`. Zero-step guards against infinite loop
  (`if step == 0 { return Ok(RuntimeValue::Null); }` at `:15863`).
- `PropertyAccess` on a node binding returns the stored
  `PropertyValue` unchanged at `:15724–15745` — so reading a list
  property (`n.tags` where `tags: PropertyValue::List(...)` was
  persisted) yields exactly the same `PropertyValue::List` shape.

All four required UNWIND RHS shapes converge on the same runtime
shape: `RuntimeValue::Property(PropertyValue::List(values))`. The
executor branch is one `for value in values { emit_row(…) }` loop.

## 2. Reproducer — the exact failing call today

### 2.1 HTTP `POST /query` (cross-transport parity)

```
# At HEAD cc63103, with no patches applied:
$ ogdb init /tmp/repro.ogdb
$ ogdb serve /tmp/repro.ogdb --http --port 7070 &
$ curl -s -X POST http://127.0.0.1:7070/query \
       -H 'content-type: application/json' \
       -d '{"query":"UNWIND [1,2,3] AS i RETURN i"}'
{"error":"physical planning for UNWIND is not implemented yet"}
# HTTP status: 400 Bad Request
```

The same query run through `ogdb query /tmp/repro.ogdb "…"` also
fails, because the CLI desugar only recognises `UNWIND range(A,B)`
— not `UNWIND [1,2,3]`.

### 2.2 Embedded API

```rust
// At HEAD cc63103:
let mut db = Database::init(path, Header::default_v1()).unwrap();
let err = db.query("UNWIND [1,2,3] AS i RETURN i").unwrap_err();
assert!(err.to_string().contains("physical planning for UNWIND is not implemented"));
```

### 2.3 Narrow desugar works but doesn't round-trip via HTTP

```
$ ogdb query /tmp/repro.ogdb "UNWIND range(1,3) AS i CREATE (:Person {id: i})"
# exit 0, 3 nodes created — via CLI desugar
$ curl -s -X POST http://127.0.0.1:7070/query \
       -d '{"query":"UNWIND range(1,3) AS i CREATE (:Person {id: i})"}'
{"error":"physical planning for UNWIND is not implemented yet"}
# Same query, same DB, different transport → different result.
```

This second reproducer is the one that most clearly demonstrates the
layer violation: the CLI-only behaviour is not a feature, it's a
transport-dependent bug.

## 3. Data-flow trace — where UNWIND slots into each stage

```
 Input Cypher string
   "UNWIND range(1,3) AS i CREATE (:Person {id: i})"
           │
           ▼
 ┌──────────────────────────┐
 │ Cypher Lexer             │  crates/ogdb-core/src/lib.rs:6777
 │ "UNWIND" → CypherKeyword │  (no change — keyword already recognised)
 │          ::Unwind        │
 └──────────────────────────┘
           │
           ▼
 ┌──────────────────────────┐
 │ Cypher Parser            │  :6869–6870 (dispatch)
 │ parse_unwind_clause()    │  :7044–7050
 │   expects expression,    │  (no change — parser already recognises
 │   `AS`, identifier       │   the clause and produces UnwindClause)
 │ → UnwindClause {         │
 │     expression,          │
 │     variable             │
 │   }                      │
 └──────────────────────────┘
           │
           ▼
 ┌──────────────────────────┐
 │ AST (CypherAst =         │  :1716–1733
 │      CypherQuery)        │
 │ clauses[..] contains:    │  (no change — AST already has the variant)
 │   CypherClause::Unwind(  │
 │     UnwindClause {..}    │
 │   )                      │
 └──────────────────────────┘
           │
           ▼
 ┌──────────────────────────┐
 │ Logical plan builder     │  :3167–3171
 │ CypherClause::Unwind(v)  │  (no change — logical op already built)
 │   => LogicalPlan::       │
 │        UnwindList {      │
 │          input: <prev>,  │
 │          expression,     │
 │          variable        │
 │        }                 │
 └──────────────────────────┘
           │                    logical_plan_output_columns: :3299–3310
           │                    (already propagates input cols ∪ {variable})
           ▼
 ┌──────────────────────────┐
 │ Physical plan builder    │  :4934–4936  ← GAP
 │ LogicalPlan::UnwindList  │
 │   => PlanError(          │
 │     "not implemented"    │  ← Phase 3 replaces this with a proper
 │   )                      │    PhysicalPlan::PhysicalUnwind build
 └──────────────────────────┘
           │
           ▼
 ┌──────────────────────────┐
 │ PhysicalPlan enum        │  :2231–2374  ← GAP
 │ (no PhysicalUnwind       │    Phase 3 adds the variant:
 │  variant exists today)   │    PhysicalUnwind {
 └──────────────────────────┘      input: Option<Box<PhysicalPlan>>,
           │                       expression: CypherExpression,
           │                       variable: String,
           │                       estimated_rows, estimated_cost
           │                     }
           ▼
 ┌──────────────────────────┐
 │ Executor                 │  :14322+ (non-traced)  ← GAP
 │ execute_physical_plan_   │  :15143+ (traced)      ← GAP
 │   batches()              │
 │ for each PhysicalPlan::  │   Phase 3 adds non-traced branch.
 │  PhysicalUnwind:         │   Phase 4 adds traced branch.
 │   input_rows ← input or  │
 │                [empty]   │
 │   for row in input_rows: │
 │     list ← evaluate_     │  (already returns PropertyValue::List for
 │       expression(expr,   │   ListLiteral @ :16233–16242,
 │       row, txn)          │   RANGE @ :15835–15873,
 │   if list is             │   property access on list @ :15724–15745)
 │   PropertyValue::List(   │
 │     values):             │
 │     for v in values:     │
 │       out_row = row      │
 │         .clone()         │
 │         .insert(         │
 │           variable, v)   │
 │       emit out_row       │
 └──────────────────────────┘
```

**Key insight.** Because list-expression evaluation is already in
place (steps 3–5 of the loop), the new executor code is
approximately 20 lines, structurally identical to the existing
`PhysicalMerge` branch at `:15104–15136` — both are "optional input,
per-row work, accumulate rows, emit batches."

## 4. Failing tests (RED) — committed in this branch

All tests live on `plan/unwind-in-core` at the RED commit. They MUST
fail against HEAD `cc63103` with the stub error
`physical planning for UNWIND is not implemented yet`, and MUST pass
after Phase 3 (core) + Phase 5 (CLI removal).

| # | Path | Scope | Assertion |
|---|------|-------|-----------|
| 1 | `crates/ogdb-core/tests/unwind_literal_list.rs` | Embedded | `UNWIND [1,2,3] AS i RETURN i` → 3 rows, i ∈ {1,2,3}, column `i` present |
| 2 | `crates/ogdb-core/tests/unwind_range_two_arg.rs` | Embedded | `UNWIND range(1,5) AS i RETURN i` → 5 rows, i = 1,2,3,4,5 in order |
| 3 | `crates/ogdb-core/tests/unwind_range_three_arg_with_step.rs` | Embedded | `UNWIND range(0,10,2) AS i RETURN i` → 6 rows, i = 0,2,4,6,8,10 |
| 4 | `crates/ogdb-core/tests/unwind_over_stored_list_property.rs` | Embedded | Seed `(:Doc {tags: ["a","b","c"]})`; `MATCH (n:Doc) UNWIND n.tags AS t RETURN t` → 3 rows |
| 5 | `crates/ogdb-core/tests/unwind_then_create_persists_all_rows.rs` | Embedded | `UNWIND range(1,7) AS i CREATE (:Person {id:i})` then `MATCH (n:Person) RETURN n.id` → 7 rows {1..7}. Mirrors the CLI regression contract `query_command_unwind_range_create_persists_all_nodes` at `crates/ogdb-cli/src/lib.rs:10020–10066`. |
| 6 | `crates/ogdb-core/tests/unwind_empty_list_yields_zero_rows.rs` | Embedded | `UNWIND [] AS i RETURN i` → `query().row_count() == 0`, no error |
| 7 | `crates/ogdb-cli/tests/http_post_query_accepts_unwind.rs` | HTTP | Start `handle_serve_http` on an ephemeral port; `POST /query {"query":"UNWIND [1,2,3] AS i RETURN i"}` → `200 OK` with `{"row_count": 3, …}` |

Test #7 is the cross-transport parity gate — it is the observable
contract that makes this branch worth shipping. Tests #1–#6 are pure
core-engine tests; they stay green regardless of CLI/HTTP wiring. Test
#7 depends on both Phase 3 (core physical op) *and* Phase 5 (CLI
desugar gone — but actually test #7 doesn't depend on Phase 5 at all,
because HTTP never called the desugar in the first place, so test #7
flips green the moment Phase 3 lands).

The CLI regression test at
`crates/ogdb-cli/src/lib.rs:10020–10066`
(`query_command_unwind_range_create_persists_all_nodes`) is
**deliberately NOT touched** at RED. It still asserts the observable
contract (7 nodes persisted). After Phase 5 removes the desugar, it
keeps asserting the same contract — but is now serviced by the core
operator. Only the stale comment pointing at the CLI desugar needs to
be rewritten.

### 4.1 Why these seven cover the behaviour

- Shape coverage: `[literal]` (#1, #6), `range(A,B)` (#2), `range(A,B,step)` (#3), `n.prop` (#4). All four of the task-required shapes.
- Semantic coverage: zero-row output (#6), non-zero-row output (#1–#5), output-column binding is visible to RETURN (#1–#4, #6), downstream CREATE sees the bound variable per row (#5).
- Transport coverage: embedded Rust API (#1–#6), HTTP JSON transport (#7). Bolt/Python/Node/FFI all route through `Database::query`, so they are covered transitively by #1–#6.
- Back-compat coverage: #5 == the same observable contract as the
  existing CLI regression test. After Phase 5, the CLI regression test
  continues to pass via the core operator rather than the desugar.

## 5. Implementation sketch (Phases 3–5 GREEN)

### 5.1 `PhysicalPlan::PhysicalUnwind` variant (Phase 3)

Insert next to `PhysicalMerge` at `crates/ogdb-core/src/lib.rs:2342`:

```rust
PhysicalUnwind {
    input: Option<Box<PhysicalPlan>>,
    expression: CypherExpression,
    variable: String,
    estimated_rows: u64,
    estimated_cost: f64,
},
```

Update the match arms at `:2377–2398` (`estimated_rows`) and
`:2400–2421` (`estimated_cost`) to include `PhysicalUnwind`. Update
every exhaustive match on `PhysicalPlan::*` — grep with:

```
grep -n 'PhysicalPlan::Physical' crates/ogdb-core/src/lib.rs
```

(Known exhaustive-match sites at HEAD: `:4509–4550`, `:14328+`,
`:15150+`, `:15565+`, `:15590+`, `:15612+`, `:23029+`, `:23040+`,
`:23056+`, `:23067+`, `:23070+`, `:31777+`. Each one either routes
`PhysicalUnwind` like `PhysicalMerge` — i.e. optional-input with
payload — or is a leaf that already default-ignores by matching only
specific variants.)

### 5.2 `build_physical_plan` (Phase 3)

Replace `crates/ogdb-core/src/lib.rs:4934–4936`:

```rust
LogicalPlan::UnwindList {
    input,
    expression,
    variable,
} => {
    let input = input
        .as_ref()
        .map(|plan| build_physical_plan(db, plan))
        .transpose()?;
    let base_rows = input
        .as_ref()
        .map(|value| value.estimated_rows())
        .unwrap_or(1);
    // Planner heuristic: assume a list fan-out of 8 when we can't infer a
    // better bound from the expression shape (ListLiteral lets us read
    // the exact length; range() lets us read start/end if both are
    // integer literals). Bounds are advisory — correctness doesn't
    // depend on them.
    let fanout = estimated_unwind_fanout(expression);
    let estimated_rows = base_rows.saturating_mul(fanout);
    let estimated_cost = input
        .as_ref()
        .map(|value| value.estimated_cost())
        .unwrap_or(0.0)
        + estimated_rows as f64;
    Ok(PhysicalPlan::PhysicalUnwind {
        input: input.map(Box::new),
        expression: expression.clone(),
        variable: variable.clone(),
        estimated_rows,
        estimated_cost,
    })
}
```

…with a small free helper next to the other expression helpers:

```rust
fn estimated_unwind_fanout(expr: &CypherExpression) -> u64 {
    match expr {
        CypherExpression::ListLiteral(values) => values.len() as u64,
        CypherExpression::FunctionCall { name, arguments, .. }
            if name.eq_ignore_ascii_case("range") && arguments.len() >= 2 =>
        {
            let lit_i64 = |e: &CypherExpression| -> Option<i64> {
                if let CypherExpression::Literal(CypherLiteral::Integer(v)) = e {
                    Some(*v)
                } else {
                    None
                }
            };
            match (lit_i64(&arguments[0]), lit_i64(&arguments[1])) {
                (Some(a), Some(b)) if b >= a => (b - a + 1) as u64,
                _ => 8,
            }
        }
        _ => 8,
    }
}
```

### 5.3 Executor — non-traced (Phase 3)

Insert next to `PhysicalMerge` in `execute_physical_plan_batches` at
`crates/ogdb-core/src/lib.rs:15104`:

```rust
PhysicalPlan::PhysicalUnwind {
    input,
    expression,
    variable,
    ..
} => {
    let input_rows = if let Some(input) = input {
        rows_from_batches(&self.execute_physical_plan_batches(input, snapshot_txn_id)?)
    } else {
        vec![BTreeMap::<String, RuntimeValue>::new()]
    };
    // Columns = existing input columns ∪ {variable}. Discovered from
    // the first input row; if there are no input rows, the output is
    // the single-column {variable}.
    let mut output_columns = input_rows
        .first()
        .map(|row| row.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    if !output_columns.iter().any(|c| c == variable) {
        output_columns.push(variable.clone());
    }
    let mut rows = Vec::<BTreeMap<String, RuntimeValue>>::new();
    for row in input_rows {
        let list_value = self.evaluate_expression(expression, &row, snapshot_txn_id)?;
        let values = match list_value {
            RuntimeValue::Property(PropertyValue::List(values)) => values,
            _ => continue, // non-list / null → zero rows for this input row, per openCypher
        };
        for value in values {
            let mut out = row.clone();
            out.insert(variable.clone(), RuntimeValue::Property(value));
            rows.push(out);
        }
    }
    Ok(batches_from_rows(&rows, &output_columns, QUERY_BATCH_SIZE))
}
```

`batches_from_rows` returns `Vec::new()` when `rows.is_empty()` (see
`:6161–6182`). This is consistent with how the existing
`PhysicalMerge` branch handles no-match cases and is what test #6
(`unwind_empty_list_yields_zero_rows`) asserts.

### 5.4 Executor — traced (Phase 4)

Add an identical branch to `execute_physical_plan_batches_traced` at
`:15143+`. The traced variant differs from the non-traced variant by
one thing: it forwards the `&mut TraceCollector` through the call to
`execute_physical_plan_batches_traced` on the input subplan instead of
`execute_physical_plan_batches`. There is no UNWIND-specific tracing
— we do not record a synthetic trace event per unwound element,
because trace events correspond to visited graph entities (nodes /
edges), not to query-engine fan-out.

### 5.5 Remove CLI desugar (Phase 5)

Delete from `crates/ogdb-cli/src/lib.rs`:
- `try_expand_unwind_range_create` at `:1880–1909`
- its two call sites at `:2006–2016` and `:2029–2046`
- `substitute_identifier_literal` at `:1956–2003` (only called by the
  desugar — verify with
  `grep -n substitute_identifier_literal crates/ogdb-cli/src/lib.rs`)
- `consume_keyword` at `:1911–1924`, `parse_leading_i64` at
  `:1926–1941`, `parse_leading_identifier` at `:1943–1954` — **only if
  they have no other callers** (verify each with `grep`)

Update the docstring on the CLI regression test at
`:10020–10026` to point at the core operator instead of the (now
deleted) desugar. The `#[test] fn query_command_unwind_range_create_persists_all_nodes`
body does not change — it's an observable-contract test, and after
Phase 5 the contract is serviced by core.

### 5.6 What stays out of scope

- WAL / storage format: UNWIND is a query-time operator. Nothing is
  persisted. No WAL record types are added.
- Parser: already correct.
- Logical planner: already correct.
- Vector / text / temporal / RDF: untouched.
- `crates/ogdb-bolt`, `ogdb-node`, `ogdb-python`, `ogdb-ffi`, MCP:
  they all call `Database::query`, so they get UNWIND for free after
  Phase 3. No per-binding work.
- `instant-distance`, `tantivy`, and other runtime deps: untouched.
- Cargo.toml: no dependency changes.

## 6. Phased rollout (8-phase TDD)

Per `AGENTS.md` and `docs/TDD-METHODOLOGY.md`: each Phase is one
commit. Phase 1 + Phase 2 ship in the RED commit on this branch.
Phase 3 through Phase 8 each produce one GREEN commit.

- **Phase 1 — Scout.** Read the CLI desugar, read the core
  parser/logical/physical/executor dispatch, confirm list evaluation
  already works. Output: this PLAN.md §1.2 table. **(This commit.)**

- **Phase 2 — RED.** Write PLAN.md + 7 failing tests under
  `crates/ogdb-core/tests/unwind_*.rs` and
  `crates/ogdb-cli/tests/http_post_query_accepts_unwind.rs`. Each test
  must fail with exactly `physical planning for UNWIND is not
  implemented yet` (or, for test #7, HTTP 400 carrying that message).
  The CLI desugar stays untouched so the pre-existing regression test
  `query_command_unwind_range_create_persists_all_nodes` stays green.
  **(This commit.)**

- **Phase 3 — GREEN path 1: PhysicalUnwind + non-traced executor.**
  Implement §5.1, §5.2, §5.3. Exhaustive-match churn per §5.1. Run:
  ```
  cargo test -p ogdb-core --tests unwind_
  ```
  Tests #1–#6 go green. Test #7 also goes green (HTTP executor path
  is non-traced). Run full core suite:
  ```
  cargo test -p ogdb-core --all-targets
  ```
  Must stay green (no regressions in the existing ~40 integration
  tests).

- **Phase 4 — GREEN path 2: traced executor branch.**
  Implement §5.4. Run:
  ```
  cargo test -p ogdb-core --all-targets
  ```
  Must stay green. In particular the `TraceCollector`-using tests
  exercise the traced path; they must not panic on `PhysicalUnwind`
  now that the variant exists.

- **Phase 5 — GREEN path 3: remove CLI desugar.**
  Delete code per §5.5. Update the regression-test comment (body
  unchanged). Run:
  ```
  cargo test -p ogdb-cli --all-targets
  ```
  `query_command_unwind_range_create_persists_all_nodes` stays green
  via the core operator. `http_post_query_accepts_unwind` stays
  green.

- **Phase 6 — Coverage.** Run the strict-coverage gate from
  `docs/TDD-METHODOLOGY.md`:
  ```
  source "$HOME/.cargo/env"
  cargo llvm-cov --package ogdb-core --package ogdb-cli \
      --lib --fail-under-lines 100
  ```
  The new `PhysicalUnwind` executor branches must be covered by
  tests #1–#7. If not, add targeted tests (e.g. `UNWIND null AS i
  RETURN i` for the non-list short-circuit on line "match … => continue"),
  or, if the desugar removal in Phase 5 dropped coverage on
  `substitute_identifier_literal`, confirm the symbol is fully
  deleted (not just dead-code-lint-suppressed).

- **Phase 7 — Docs.**
  - `CHANGELOG.md` — `[Unreleased]` entry:
    > `UNWIND` is now a first-class physical operator in the core
    > query engine. It works uniformly over CLI, embedded, HTTP, Bolt,
    > Python, Node, and FFI transports. Supports list literals, `range(A,B)`,
    > `range(A,B,step)`, and stored list properties. Removes the
    > transport-specific CLI string-desugar that previously handled
    > only `UNWIND range(A,B) AS <var> <body>` via
    > `crates/ogdb-cli/src/lib.rs`.
  - `docs/IMPLEMENTATION-LOG.md` — new step entry with the usual
    template (date, scope, files touched, gates re-run).
  - `ARCHITECTURE.md` — Cypher-coverage table, mark UNWIND DONE.
  - No change to `SPEC.md`, `DESIGN.md`, or `BENCHMARKS.md`.

- **Phase 8 — Final workspace regression.** Run:
  ```
  ./scripts/test.sh
  ./scripts/changelog-check.sh
  ./scripts/workflow-check.sh
  ```
  All green = branch is mergeable via `/ultrareview`.

## 7. What a Phase-3 GREEN commit looks like (for the executing agent)

```
feat(unwind-in-core): PhysicalUnwind operator + non-traced executor branch

- PhysicalPlan grows a PhysicalUnwind { input, expression, variable,
  estimated_rows, estimated_cost } variant, modelled after PhysicalMerge.
- build_physical_plan replaces the "not implemented" stub with a real
  build that picks an estimated-rows fanout from the expression shape
  (ListLiteral = exact length, literal range() = exact span, else 8).
- execute_physical_plan_batches handles PhysicalUnwind: for each input
  row, evaluate the RHS expression, expect PropertyValue::List, fan
  out one output row per list element with {variable → element}.
  Non-list / null RHS yields zero rows for that input row, per
  openCypher semantics.
- Exhaustive-match sites across lib.rs updated to include PhysicalUnwind.

Gates green now:
  cargo test -p ogdb-core --test unwind_literal_list
  cargo test -p ogdb-core --test unwind_range_two_arg
  cargo test -p ogdb-core --test unwind_range_three_arg_with_step
  cargo test -p ogdb-core --test unwind_over_stored_list_property
  cargo test -p ogdb-core --test unwind_then_create_persists_all_rows
  cargo test -p ogdb-core --test unwind_empty_list_yields_zero_rows
  cargo test -p ogdb-cli  --test http_post_query_accepts_unwind
  cargo test -p ogdb-core --all-targets             # no regressions
  cargo test -p ogdb-cli  --all-targets             # CLI regression unchanged

CLI desugar still in place — Phase 5 removes it. Parser, logical plan,
and existing executor branches unchanged. Unchanged public API. No
WAL / sidecar format bumps.

Committed by Ashesh Goplani
```

---

_End of PLAN.md — Phase 2 artifact._
