# Phase 4: Query Optimization - Research Notes

## Current Query Planner Architecture

### Pipeline Overview (crates/ogdb-core/src/lib.rs)

```
Cypher text
  → parse_cypher()          [winnow lexer/parser → AST]
  → analyze_cypher()        [semantic analysis → SemanticModel]
  → plan_cypher()           [build_logical_plan() → LogicalPlan]
  → physical_plan_cypher()  [build_physical_plan() → PhysicalPlan]
  → execute_physical_plan() [execute_physical_plan_batches() → RuntimeBatch → QueryResult]
```

### Logical Plan (lines 1728-1819)

`LogicalPlan` enum with variants: Scan, VectorScan, TextSearch, Expand, CartesianProduct, Filter, Project, Sort, Limit, Skip, Aggregate, Create, CreateIndex, Delete, SetProperties, RemoveProperties, UnwindList, Merge.

`build_logical_plan()` at line 2685 chains MATCH → CREATE → DELETE → SET → REMOVE → WITH → UNWIND → MERGE → RETURN clauses.

### MATCH Compilation (lines 2931-3084)

`plan_match_clause()` processes patterns sequentially:
1. For each pattern, scan start node (or reuse bound variable).
2. For each chain in pattern, add Expand operator.
3. Apply WHERE predicate at earliest binding point (filter pushdown).
4. Unbound start nodes from separate patterns join via CartesianProduct.

**Key limitation:** Patterns are always compiled as a left-deep tree of binary Expand operators. No multi-way join consideration. A query like `MATCH (a)-[:R]->(b)-[:S]->(c)` always becomes `Scan(a) → Expand(a→b) → Expand(b→c)`. A three-disconnected-pattern MATCH becomes `Scan(a) × Scan(b) × Scan(c)` with CartesianProduct.

### Physical Plan (lines 1836-1955)

`PhysicalPlan` enum mirrors LogicalPlan with added cost metadata:
- Every variant carries `estimated_rows: u64` and `estimated_cost: f64`.
- `PhysicalExpand` additionally carries `join_strategy: PhysicalJoinStrategy`.

`PhysicalJoinStrategy` (line 1830): `NestedLoop` or `HashJoin`.

### Join Strategy Selection (lines 3995-3999)

Binary decision:
```rust
if input_rows > 128 || edge_rows > 512 {
    PhysicalJoinStrategy::HashJoin
} else {
    PhysicalJoinStrategy::NestedLoop
}
```

No WCOJ, leapfrog, or multi-way join strategies exist.

### Cardinality Estimation (lines 3861-3880)

Two functions:
- `label_cardinality_for_scan(db, label)`: uses Roaring bitmap `.len()` for label membership.
- `edge_count_for_type(db, edge_type)`: counts from `adjacency_by_type` CSR index.

### Cost Model

| Operator | Cost Formula |
|----------|-------------|
| SequentialScan | `total_nodes` |
| IndexScan | `estimated_rows * 0.65` |
| Expand (NL) | `input_cost + input_rows * edge_rows` |
| Expand (HJ) | `input_cost + edge_rows + input_rows` |
| CartesianProduct | `left_cost + right_cost + left_rows * right_rows` |
| Filter | `input_cost + input_rows` |

### Filter Selectivity (lines 3086-3114)

Fixed coefficients: Eq=0.15, NotEq=0.85, comparisons=0.35, regex=0.20, And=product, Or=additive.

### Execution Engine (lines 12438-12624)

`execute_physical_plan_batches()` recursively materializes each operator:
- **Intermediate format:** `Vec<RuntimeBatch>` (column-oriented, converted to/from `BTreeMap<String, RuntimeValue>` rows).
- **Batch size:** `QUERY_BATCH_SIZE = 256` (line 62).
- **Full materialization:** Every operator fully materializes output before passing to parent.
- **Pull-based:** Each operator recursively calls input.

### RuntimeValue (lines 4830-4835)

```rust
enum RuntimeValue { Null, Property(PropertyValue), Node(u64), Edge(RuntimeEdgeRef) }
```

### RuntimeBatch (lines 4838-4868)

Column-oriented: `columns: Vec<String>`, `data: BTreeMap<String, Vec<RuntimeValue>>`.

Conversion utilities:
- `rows_from_batches()` at line 5267: batch → row vectors.
- `batches_from_rows()` at line 5286: row vectors → batches.

### Expand Implementation

- **NestedLoop** (`expand_neighbors_for_node`, line 14436): Scans ALL edge_records for each input row. O(E) per row.
- **HashJoin** (`expand_hash_lookup`, line 14490): Pre-scans ALL edge_records once into HashMap<u64, Vec<(edge_ref, neighbor)>>. O(E) build + O(1) lookup per row.

### CartesianProduct Implementation (lines 12625-12672)

Nested loop: for each left_row × each right_row, merge columns.

---

## WCOJ (Worst-Case Optimal Join) Strategy

### Problem

Binary joins (the current approach) can produce intermediate results exponentially larger than the final output. For a triangle query `MATCH (a)-[:R]->(b)-[:R]->(c)-[:R]->(a)`, binary joins:
1. Scan(a) → Expand(a→b): O(|E_R|) rows
2. Expand(b→c): O(|E_R| * avg_degree) rows (potential blowup)
3. Filter(c→a): retains only triangles

With a power-law graph (high-degree nodes), step 2 can produce O(|E_R|^1.5) intermediate rows even though the final output is much smaller.

### Solution: Generic Join / Leapfrog Trie Join

WCOJ algorithms (Ngo/Porat/Ré 2012, LogicBlox leapfrog) evaluate all relations simultaneously:

1. **Build sorted adjacency indexes** per relation/edge type: for each `(src, dst)` pair, maintain sorted neighbor lists.
2. **Intersect** neighbor lists: for a triangle (a,b,c), iterate variable `a` over all nodes, then for each `a`, intersect `neighbors_R(a)` with `reverse_neighbors_R(a)` to get candidate `b` values, then intersect `neighbors_R(b)` with `{a}` to validate `c = a`.
3. **Leapfrog merge:** Multiple sorted iterators advance in lockstep, skipping past gaps.

### Design for OpenGraphDB

**When to use WCOJ:** When the query planner detects a multi-way join pattern where:
- 3+ variables are connected by edges forming a cycle or dense subgraph
- The binary join cost estimate exceeds a threshold relative to WCOJ estimate

**WCOJ cost estimate:** For k-way join on relations R1...Rk sharing variables, the WCOJ bound is O(|DB|^(k/2)) which for triangles is O(|E|^1.5). Compare to binary join worst case O(|E|^2).

**Decision rule:** At physical plan time, detect multi-expand chains. If the pattern forms a cycle (variable reuse) or involves 3+ connected expansions, estimate WCOJ cost vs binary chain cost. Choose lower.

---

## Factorized Intermediate Results

### Problem

Standard row-at-a-time execution materializes the full Cartesian product of all intermediate columns. For a query returning `a.name, b.name, c.name` where `a` has 100 values, `b` has 100, and `c` has 100, a CartesianProduct produces 1,000,000 rows even though only 300 distinct values exist across the three columns.

### Solution: Factorized Representation

Instead of materializing `|a| × |b| × |c|` rows, store:
- Column `a`: [a1, a2, ..., a100]
- Column `b`: [b1, b2, ..., b100]
- Column `c`: [c1, c2, ..., c100]
- A compact representation of which combinations are valid

For independent (non-correlated) columns, this is a pure Cartesian decomposition. For correlated columns (e.g., a→b via edge), use a tree structure:
```
a_values -> for each a: [b_values connected to a] -> for each b: [c_values connected to b]
```

### Design for OpenGraphDB

**FactorizedResult structure:**
- Tree of `FactorNode` entries, each holding a variable name and its distinct values.
- Children represent dependent variables.
- Materialization is deferred until final projection or aggregation.

**When to use:** When the planner estimates that the factorized representation will use significantly less memory than flat rows (i.e., when intermediate fan-out is high but final output is bounded).

**Integration point:** Replace `Vec<RuntimeBatch>` with `FactorizedBatch` at the PhysicalCartesianProduct and PhysicalExpand operators. Add a `PhysicalFactorizedExpand` plan node that produces `FactorizedBatch` instead of flat rows. The final Project/Aggregate operator materializes the factorized representation into flat rows for output.

---

## Key Code Locations Summary

| Component | Location |
|-----------|----------|
| LogicalPlan enum | lib.rs:1728-1819 |
| PhysicalJoinStrategy enum | lib.rs:1830-1833 |
| PhysicalPlan enum | lib.rs:1836-1955 |
| PhysicalPlan::estimated_rows/cost | lib.rs:1957-1999 |
| plan_match_clause() | lib.rs:2931-3084 |
| estimate_filter_selectivity() | lib.rs:3086-3114 |
| edge_count_for_type() | lib.rs:3861-3870 |
| label_cardinality_for_scan() | lib.rs:3872-3880 |
| build_physical_plan() | lib.rs:3882-4210 |
| RuntimeValue enum | lib.rs:4830-4835 |
| RuntimeBatch struct | lib.rs:4838-4868 |
| rows_from_batches() | lib.rs:5267-5284 |
| batches_from_rows() | lib.rs:5286-5307 |
| query_profiled_cypher() | lib.rs:11383-11444 |
| execute_physical_plan() | lib.rs:12438-12447 |
| execute_physical_plan_batches() | lib.rs:12449-12637 |
| PhysicalExpand executor | lib.rs:12553-12624 |
| PhysicalCartesianProduct executor | lib.rs:12625-12672 |
| expand_neighbors_for_node() | lib.rs:14436-14488 |
| expand_hash_lookup() | lib.rs:14490-14550 |
| Pattern struct | lib.rs:1442-1445 |
| PatternChain struct | lib.rs:1448-1451 |
| NodePattern struct | lib.rs:1454-1458 |
| RelationshipPattern struct | lib.rs:1461-1467 |
| MatchClause struct | lib.rs:1360-1365 |

---
*Research completed: 2026-02-27*
