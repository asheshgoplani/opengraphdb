---
phase: 12-graph-native-rag
plan: 01
subsystem: database
tags: [leiden, community-detection, graph-algorithms, rag, hierarchy, rust]

# Dependency graph
requires: []
provides:
  - Leiden community detection algorithm (community_leiden, community_leiden_at)
  - Multi-resolution hierarchical community index (build_community_hierarchy, CommunityHierarchy)
  - Extended CommunitySummary with level, parent_community_id, and description fields
  - CommunityMember struct with degree_within and degree_outside metrics
  - CommunityHierarchy navigation API (top_level, children_of, members_of)
affects: [12-02, 12-03, 12-04, 12-05, 13-ai-demo-experience]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Leiden adds refinement phase over Louvain: BFS connected-component check splits disconnected subclusters"
    - "Multi-resolution hierarchy: higher resolution = more communities (finer granularity)"
    - "Parent-child links determined by majority-vote of member node assignments across resolution levels"
    - "Summarize callback pattern: caller provides Fn(&[u64], &[(u64, u64, String)]) -> String for LLM integration"

key-files:
  created: []
  modified:
    - crates/ogdb-core/src/lib.rs

key-decisions:
  - "Leiden signature uses resolution: f64 parameter matching Louvain's modularity optimization"
  - "EdgeRecord has no edge_type field; edge types retrieved via edge_type_at(eid, snapshot_txn_id)"
  - "Summarize callback edge triples use String (owned) not &str to avoid lifetime complications"
  - "community_leiden and build_community_hierarchy exposed on Database, ReadTransaction, and ReadSnapshot"
  - "build_community_summaries_at defaults: level=0, parent_community_id=None, description=String::new() for backward compat"

patterns-established:
  - "Leiden refinement: Phase 1 (Louvain modularity optimization) + Phase 2 (BFS connectivity check per community)"
  - "Hierarchy construction: run Leiden at multiple resolutions, remap IDs to global namespace, vote for parent assignment"

requirements-completed: [RAG-01, RAG-02]

# Metrics
duration: 30min
completed: 2026-03-12
---

# Phase 12 Plan 01: Graph-Native RAG Engine - Leiden and Hierarchy Summary

**Leiden community detection with BFS refinement + multi-resolution CommunityHierarchy for PageIndex-style LLM graph navigation**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-12T20:43:58Z
- **Completed:** 2026-03-12T21:15:00Z
- **Tasks:** 4
- **Files modified:** 1 (crates/ogdb-core/src/lib.rs)

## Accomplishments

- Leiden algorithm implemented with Phase 1 (Louvain modularity optimization with resolution parameter) and Phase 2 (BFS connected-component check to split disconnected subclusters), guaranteeing well-connected communities
- Multi-resolution CommunityHierarchy built by running Leiden at each resolution, remapping community IDs to a globally unique namespace, and linking parent communities via majority-vote of member node assignments
- CommunitySummary extended with level, parent_community_id, and description fields; backward-compatible with existing build_community_summaries_at
- All 4 tests pass covering cluster detection, refinement correctness, multi-resolution levels, and custom summarize callback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add new types for hierarchical community index** - `2dda0d5` (feat)
2. **Task 2: Implement Leiden community detection algorithm** - `b51ff2b` (feat)
3. **Task 3: Build hierarchical community index with multi-resolution Leiden** - `d6e32fe` (feat)
4. **Task 4: Unit tests for Leiden and hierarchy** - `0801653` (feat)

## Files Created/Modified

- `/Users/ashesh/opengraphdb/crates/ogdb-core/src/lib.rs` - Added CommunityMember, CommunityHierarchy structs; extended CommunitySummary; implemented community_leiden_at, build_community_hierarchy_at; exposed on Database, ReadTransaction, ReadSnapshot; 4 new tests

## Decisions Made

- Leiden signature uses `resolution: f64` parameter to scale the null-model term in Louvain's modularity gain calculation. This matches the existing Louvain pattern and enables multi-resolution detection.
- The EdgeRecord struct in ogdb-core has no edge_type field. Edge types are retrieved via `edge_type_at(edge_id, snapshot_txn_id)`. The plan's proposed code was adapted accordingly.
- Summarize callback uses owned `String` in edge triples `(u64, u64, String)` rather than `&str` to avoid lifetime complications with temporary edge type values.
- Both `community_leiden` and `build_community_hierarchy` exposed on all three access points: `Database` (current snapshot), `ReadTransaction`, and `ReadSnapshot`.
- `build_community_summaries_at` default values: `level: 0`, `parent_community_id: None`, `description: String::new()` maintain backward compatibility.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted edge type access in build_community_hierarchy_at**
- **Found during:** Task 3 (build_community_hierarchy_at implementation)
- **Issue:** Plan's code referenced `record.edge_type` but EdgeRecord only has src/dst fields; edge types are stored in a separate version chain
- **Fix:** Used `self.edge_type_at(eid, snapshot_txn_id).ok().flatten().unwrap_or_default()` to retrieve edge type strings
- **Files modified:** crates/ogdb-core/src/lib.rs
- **Verification:** cargo check passes
- **Committed in:** d6e32fe (Task 3 commit)

**2. [Rule 1 - Bug] Fixed test type mismatches in create_node_with calls**
- **Found during:** Task 4 (unit test compilation)
- **Issue:** Plan used `&[&str]` literals but `create_node_with` expects `&[String]`; also `format!().as_str()` creates temporaries
- **Fix:** Used owned String values: `&[label]` with `let label = format!(...)` or `&["Label".to_string()]`
- **Files modified:** crates/ogdb-core/src/lib.rs
- **Verification:** All 4 tests compile and pass
- **Committed in:** 0801653 (Task 4 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes required for compilation correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed API mismatches above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Leiden and CommunityHierarchy types are ready for Phase 12 Plans 02-05 (PageIndex navigation, RAG retrieval, MCP tools, integration)
- community_leiden exposed on all three Database access surfaces (embedded, read-transaction, read-snapshot)
- CommunityHierarchy.top_level() / children_of() / members_of() navigation methods ready for LLM traversal patterns

---
*Phase: 12-graph-native-rag*
*Completed: 2026-03-12*
