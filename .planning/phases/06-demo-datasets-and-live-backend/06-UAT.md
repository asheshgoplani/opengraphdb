---
status: complete
phase: 06-demo-datasets-and-live-backend
source: [06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md]
started: 2026-03-01T23:50:00Z
updated: 2026-03-01T23:52:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Demo JSON datasets exist with realistic data
expected: Three JSON files exist in datasets/ directory: movies.json (~262 nodes), social.json (~280 nodes), fraud.json (~140 nodes). Each contains import-ready node/edge data with non-overlapping ID ranges.
result: pass

### 2. Idempotent seed script is present and executable
expected: scripts/seed-demo.sh exists, is executable, supports OGDB_BIN and OGDB_DEMO_DB overrides, and runs a delete+init+import sequence for reproducible demo setup.
result: pass

### 3. Expanded offline playground datasets
expected: In-memory sample datasets are substantially richer than Phase 5: movies ~120 nodes, social ~53 nodes, fraud ~40 nodes. Each has guided queries with category tags (Explore/Traverse/Analyze) and liveDescriptor metadata.
result: pass

### 4. Live backend transform layer
expected: transformLiveResponse() in api/transform.ts handles row-based backend responses with Map-based node dedup, edge descriptor support, null/empty guards. 5 dedicated tests in live-backend-transform.test.ts verify this behavior.
result: pass

### 5. Schema API normalization
expected: API client normalizes backend schema fields (edge_types to relationshipTypes, property_keys to propertyKeys) at the boundary so frontend code uses consistent naming.
result: pass

### 6. LiveModeToggle component
expected: A new LiveModeToggle component in components/playground/ provides compact Sample/Live radio-style controls for the playground header.
result: pass

### 7. ConnectionBadge mode-aware status
expected: ConnectionBadge shows "Sample Data" label with in-memory timing when offline, "Live" with live timing when connected, and "Error" with red styling when live queries fail.
result: pass

### 8. Category-grouped guided query cards
expected: Playground page renders guided queries grouped by category (Explore, Traverse, Analyze) with section headings, rather than a flat list.
result: pass

### 9. All tests pass (23 tests across 5 files)
expected: npx vitest run completes with 23 tests passing across 5 test files including the new live-backend-transform.test.ts.
result: pass

### 10. Production build succeeds
expected: npx vite build completes successfully producing dist/ output. TypeScript compilation (npx tsc --noEmit) also passes cleanly.
result: pass

## Summary

total: 10
passed: 10
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
