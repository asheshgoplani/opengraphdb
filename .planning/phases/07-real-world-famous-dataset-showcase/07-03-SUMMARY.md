---
phase: 07-real-world-famous-dataset-showcase
plan: 03
subsystem: frontend-registry
tags: [datasets, registry, typescript, tests, showcase, grid-layout, movielens, air-routes, got, wikidata]
dependency_graph:
  requires:
    - 07-02 (MOVIELENS_SAMPLE, AIR_ROUTES_SAMPLE, GOT_SAMPLE, WIKIDATA_SAMPLE and their query arrays)
  provides:
    - DatasetKey union type with 4 members for playground and showcase components
    - DATASETS record wiring 4 famous datasets into the central registry
    - getDatasetList() returning 4 dataset metadata entries
    - Passing test suite for all 4 datasets (6 test cases)
    - 4-card responsive showcase grid on landing page
  affects:
    - frontend playground DatasetSwitcher (auto-picks up 4 entries via getDatasetList)
    - frontend ShowcaseSection landing grid (4 cards, md:grid-cols-2 lg:grid-cols-4)
    - Phase 8 geographic rendering (airroutes lat/lon preserved through registry)
tech_stack:
  added: []
  patterns:
    - Central registry pattern: DATASETS record + getDatasetList/getDatasetQueries/runDatasetQuery utilities unchanged
    - Old inline MOVIES_QUERIES removed; all queries now live in per-dataset modules
    - buildActorCollaborationsSubgraph helper removed as movies dataset no longer exists
key_files:
  created: []
  modified:
    - frontend/src/data/datasets.ts
    - frontend/src/data/datasets.test.ts
    - frontend/src/components/landing/ShowcaseSection.tsx
  deleted:
    - frontend/src/data/sampleGraph.ts
    - frontend/src/data/socialGraph.ts
    - frontend/src/data/fraudGraph.ts
    - frontend/src/data/sampleGraph.test.ts
decisions:
  - "ShowcaseSection grid uses md:grid-cols-2 lg:grid-cols-4 for responsive 2x2 on medium screens and 1x4 on large screens"
  - "Landing heading updated to 'Famous Graph Datasets' to reflect real-world benchmark nature"
  - "CARD_DELAY_CLASSES extended to 4 entries with animate-delay-[400ms] for the 4th card"
metrics:
  duration: 2 minutes
  completed: "2026-03-02"
  tasks: 2
  files_created: 0
  files_modified: 3
  files_deleted: 4
---

# Phase 7 Plan 03: Dataset Registry Integration and Showcase Grid Update Summary

**One-liner:** Wired 4 famous dataset modules into the central registry replacing 3 synthetic datasets, updated all tests, and updated the landing page to a responsive 4-card showcase grid.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update datasets.ts registry and remove old modules | 36ba1a3 | frontend/src/data/datasets.ts (modified), sampleGraph.ts, socialGraph.ts, fraudGraph.ts, sampleGraph.test.ts (deleted) |
| 2 | Update tests and ShowcaseSection grid layout | 0f1d038 | frontend/src/data/datasets.test.ts, frontend/src/components/landing/ShowcaseSection.tsx |

## What Changed

### datasets.ts Registry

- `DatasetKey` type changed from `'movies' | 'social' | 'fraud'` to `'movielens' | 'airroutes' | 'got' | 'wikidata'`
- Imports replaced: old `sampleGraph.js`, `socialGraph.js`, `fraudGraph.js` imports replaced with `movieLensGraph.js`, `airRoutesGraph.js`, `gotGraph.js`, `wikidataGraph.js`
- `DATASETS` record now has 4 entries with descriptive real-world names and descriptions:
  - `movielens`: "MovieLens 25M" from GroupLens Research
  - `airroutes`: "Air Routes Network" from Kelvin Lawrence's Practical Gremlin dataset
  - `got`: "Game of Thrones" from Andrew Beveridge's research
  - `wikidata`: "Nobel Prize Knowledge Graph" from the Nobel Prize Foundation API
- Removed `buildActorCollaborationsSubgraph` helper and inline `MOVIES_QUERIES` array (1,324 lines total removed)
- All generic utility functions (`cloneNode`, `cloneLink`, `cloneGraphData`, `buildRelationshipSubgraph`, `buildDatasetMeta`, `getDatasetList`, `getDatasetQueries`, `runDatasetQuery`) unchanged

### datasets.test.ts

- All 5 test cases updated with new dataset keys; a 6th test was already present and now fully exercises the new labels
- Label assertions verify: movielens has Movie/Genre, airroutes has Airport/Country/Continent, got has Character/Season, wikidata has Laureate/Category/Country
- Dataset count assertions updated from 3 to 4
- All 6 tests pass

### ShowcaseSection.tsx

- Grid class updated: `md:grid-cols-3` to `md:grid-cols-2 lg:grid-cols-4`
- `CARD_DELAY_CLASSES` extended to 4 entries with `animate-delay-[400ms]` for the 4th card
- Section heading updated: "Real-World Knowledge Graphs" to "Famous Graph Datasets"
- Description paragraph updated to reference industry-standard benchmarks (Neo4j, TigerGraph, Amazon Neptune)

## Verification Results

- TypeScript: `npx tsc --noEmit` passes with zero errors
- Tests: All 6 dataset tests pass (0 failures)
- Old dataset keys (`movies`, `social`, `fraud`) confirmed absent from datasets.ts and datasets.test.ts
- Old data files (sampleGraph.ts, socialGraph.ts, fraudGraph.ts, sampleGraph.test.ts) confirmed deleted
- ShowcaseSection grid accommodates 4 cards with responsive 2-column and 4-column breakpoints

## Deviations from Plan

None. Plan executed exactly as written.

- The 6th test ("dataset labels include expected domain entities") was already present in the test file alongside the 5 described in the plan. It was updated along with the other tests.
- The `buildRelationshipSubgraph` utility was kept intact (used generically by all new dataset modules through filterFn closures in the individual graph modules).

## Self-Check: PASSED

Files verified on disk:
- FOUND: frontend/src/data/datasets.ts (modified, 4 dataset entries)
- FOUND: frontend/src/data/datasets.test.ts (6 tests, all new keys)
- FOUND: frontend/src/components/landing/ShowcaseSection.tsx (4-card grid)
- MISSING (correctly deleted): frontend/src/data/sampleGraph.ts
- MISSING (correctly deleted): frontend/src/data/socialGraph.ts
- MISSING (correctly deleted): frontend/src/data/fraudGraph.ts
- MISSING (correctly deleted): frontend/src/data/sampleGraph.test.ts

Commits verified in git log:
- FOUND commit: 36ba1a3 (feat(07-03): update datasets registry with 4 real-world famous datasets)
- FOUND commit: 0f1d038 (feat(07-03): update tests and ShowcaseSection for 4 famous datasets)
