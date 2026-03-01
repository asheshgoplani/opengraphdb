---
phase: 08-revolutionary-graph-visualization
plan: 02
subsystem: api
tags: [rust, sse, server-sent-events, cypher, traversal, tracing, typescript, react-query]

# Dependency graph
requires:
  - phase: 08-revolutionary-graph-visualization
    plan: 01
    provides: TraceStep/TraceData types in frontend/src/types/graph.ts and geographic/trace store foundations
provides:
  - TraceCollector struct in ogdb-core recording real node/edge IDs during physical plan execution
  - Database::query_with_trace() method returning QueryResult plus traversal trace data
  - SharedDatabase::query_cypher_as_user_with_trace() for authenticated trace queries
  - POST /query/trace SSE endpoint streaming trace steps then final result event
  - Frontend ApiClient.queryWithTrace() SSE method with onTraceStep callback
  - useTraceQuery() React Query mutation hook
affects: [08-03-query-trace-animation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TraceCollector: thread-safe mutable collector passed into physical plan execution"
    - "execute_physical_plan_batches_traced: mirrors _batches but propagates trace through Scan/Expand/Filter/Project/Sort/Limit arms"
    - "SSE endpoint writes directly to TcpStream before dispatch_http_request — intercept pattern in serve_http loop"
    - "Frontend SSE parsing via fetch + ReadableStream (not EventSource, which doesn't support POST)"

key-files:
  created: []
  modified:
    - crates/ogdb-core/src/lib.rs
    - crates/ogdb-cli/src/lib.rs
    - frontend/src/types/api.ts
    - frontend/src/api/client.ts
    - frontend/src/api/queries.ts

key-decisions:
  - "TraceCollector records real traversal order during PhysicalScan (scanned node IDs) and PhysicalExpand (expanded neighbor IDs + edge IDs) — NOT extracted from results"
  - "execute_physical_plan_batches_traced propagates tracing through Filter, Project, Sort, Limit by recursively calling _traced on input children"
  - "SSE endpoint intercepts POST /query/trace before dispatch_http_request in the serve_http loop — clean separation without modifying existing /query path"
  - "Frontend SSE parsing uses fetch + ReadableStream with manual double-newline splitting — EventSource API rejected because it does not support POST requests"
  - "unique_node_ids() preserves first-seen traversal order while deduplicating for animation playback"

patterns-established:
  - "Physical plan tracing: instrument Scan/Expand leaf nodes, propagate via wrapper nodes (Filter/Project/Sort/Limit) recursively"
  - "SSE streaming from hand-rolled TCP HTTP server: write headers first, flush, then stream events"
  - "API client SSE consumption: fetch + ReadableStream + manual buffer + double-newline split"

requirements-completed: [VIZ-03]

# Metrics
duration: 25min
completed: 2026-03-02
---

# Phase 8 Plan 02: Query Trace Instrumentation and SSE Delivery Summary

**Real traversal tracing via TraceCollector instrumented at PhysicalScan/PhysicalExpand, streamed as SSE events from POST /query/trace, consumed by ApiClient.queryWithTrace() SSE method**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-02T00:00:00Z
- **Completed:** 2026-03-02T00:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added TraceCollector struct to ogdb-core with record_node/record_edge/unique_node_ids methods
- Implemented execute_physical_plan_batches_traced instrumenting Scan and Expand nodes, propagating through Filter/Project/Sort/Limit recursively
- Added Database::query_with_trace() and SharedDatabase::query_cypher_as_user_with_trace() exposing trace API
- Added POST /query/trace SSE endpoint in ogdb-cli intercepting before dispatch_http_request, streaming individual trace step events then a final result event
- Extended frontend with TraceStepEvent type, ApiClient.queryWithTrace() SSE method, and useTraceQuery() hook

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend TraceCollector and SSE endpoint** - `5ec90e1` (feat)
2. **Task 2: Frontend API client and types** - `bc1d471` (feat)

**Plan metadata:** (created in this step)

## Files Created/Modified

- `crates/ogdb-core/src/lib.rs` - TraceCollector struct, execute_physical_plan_batches_traced, query_with_trace, query_cypher_as_user_with_trace, unit test
- `crates/ogdb-cli/src/lib.rs` - handle_trace_sse function, POST /query/trace intercept in serve_http loop
- `frontend/src/types/api.ts` - TraceStepEvent interface added
- `frontend/src/api/client.ts` - queryWithTrace() SSE method added
- `frontend/src/api/queries.ts` - useTraceQuery() mutation hook added

## Decisions Made

- TraceCollector records real traversal order during PhysicalScan (node IDs found by scan) and PhysicalExpand (expanded neighbor IDs and edge IDs). Not extracted from results.
- execute_physical_plan_batches_traced handles PhysicalFilter, PhysicalProject, PhysicalSort, PhysicalLimit explicitly to propagate tracing recursively through the plan tree. Other plan nodes (mutations, WcojJoin, etc.) fall through to regular execution since they are not used in animation read queries.
- SSE endpoint intercepts POST /query/trace before dispatch_http_request in the serve_http loop — clean separation, does not modify existing /query path.
- Frontend SSE parsing uses fetch + ReadableStream with manual buffer and double-newline splitting. EventSource API was rejected because it does not support POST requests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RuntimeEdgeRef has no offset field**
- **Found during:** Task 1 (execute_physical_plan_batches_traced implementation)
- **Issue:** Plan specified trace.record_edge(src, neighbor, edge_ref.offset) but RuntimeEdgeRef uses edge_id not offset
- **Fix:** Changed to trace.record_edge(src, neighbor, edge_ref.edge_id) and updated struct comment
- **Files modified:** crates/ogdb-core/src/lib.rs
- **Verification:** cargo build -p ogdb-core succeeded
- **Committed in:** 5ec90e1 (Task 1 commit)

**2. [Rule 1 - Bug] Trace empty because PhysicalProject fell through to non-tracing path**
- **Found during:** Task 1 verification (query_with_trace_records_visited_nodes test failed)
- **Issue:** The _ => fallback in execute_physical_plan_batches_traced delegated to execute_physical_plan_batches for all non-Scan/Expand nodes. Since MATCH ... RETURN queries produce PhysicalProject(PhysicalExpand(PhysicalScan)), the Project node hit the fallback and used the regular (non-tracing) path, leaving trace.visited_node_ids empty.
- **Fix:** Added explicit arms for PhysicalFilter (with indexed scan fast path), PhysicalProject, PhysicalSort, PhysicalLimit that recursively call _traced on their input children
- **Files modified:** crates/ogdb-core/src/lib.rs
- **Verification:** cargo test -p ogdb-core --release --lib -- query_with_trace passes
- **Committed in:** 5ec90e1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed bugs above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TraceCollector, query_with_trace, and POST /query/trace SSE endpoint are complete and tested
- Frontend ApiClient.queryWithTrace() and useTraceQuery() hook are ready for use
- Plan 03 (query trace animation) can integrate queryWithTrace() to drive canvas animation using the onTraceStep callback

---
*Phase: 08-revolutionary-graph-visualization*
*Completed: 2026-03-02*
