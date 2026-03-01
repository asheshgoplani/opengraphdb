---
phase: 07-real-world-famous-dataset-showcase
plan: 02
subsystem: frontend-data
tags: [offline-fallback, graph-data, typescript, datasets, movielens, air-routes, got, wikidata]
dependency_graph:
  requires: []
  provides:
    - MOVIELENS_SAMPLE and MOVIELENS_QUERIES for MovieLens offline fallback
    - AIR_ROUTES_SAMPLE and AIR_ROUTES_QUERIES for Air Routes offline fallback
    - GOT_SAMPLE and GOT_QUERIES for GoT character interaction offline fallback
    - WIKIDATA_SAMPLE and WIKIDATA_QUERIES for Nobel Prize offline fallback
  affects:
    - frontend playground dataset selector (Phase 7 Plan 3 integration)
    - Phase 8 geographic rendering (Air Routes lat/lon)
tech_stack:
  added: []
  patterns:
    - Local cloneNode/cloneLink/cloneGraphData helpers per module (same as fraudGraph.ts)
    - String-prefixed node IDs to avoid collision with backend numeric IDs
    - filterFn operating on static GraphData for offline query simulation
    - liveDescriptor mapping for live backend mode compatibility
key_files:
  created:
    - frontend/src/data/movieLensGraph.ts
    - frontend/src/data/airRoutesGraph.ts
    - frontend/src/data/gotGraph.ts
    - frontend/src/data/wikidataGraph.ts
  modified: []
decisions:
  - "Node IDs use short dataset prefixes (ml-, ar-, got-, wd-) to prevent ID collision with live backend numeric IDs"
  - "Air Routes airports use accurate real-world float lat/lon coordinates for Phase 8 geographic rendering"
  - "GoT offline subset focuses on Season 1 interactions for visual coherence with broader seasons available"
  - "Wikidata module includes cross-prize laureates (Linus Pauling in both Chemistry and Peace)"
metrics:
  duration: 7 minutes
  completed: "2026-03-01"
  tasks: 2
  files_created: 4
---

# Phase 7 Plan 02: Offline Fallback Graph Data Modules Summary

**One-liner:** Four hand-curated TypeScript offline fallback modules with 24 guided Cypher queries covering MovieLens ratings, Air Routes geography, GoT character interactions, and Nobel Prize knowledge graphs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MovieLens and Air Routes offline fallback modules | 3648e3c | frontend/src/data/movieLensGraph.ts, frontend/src/data/airRoutesGraph.ts |
| 2 | Game of Thrones and Wikidata/Nobel offline fallback modules | 8ca2857 | frontend/src/data/gotGraph.ts, frontend/src/data/wikidataGraph.ts |

## Module Details

### MovieLens Graph (movieLensGraph.ts)
- 60 Movie nodes with well-known titles (Shawshank Redemption, The Godfather, The Dark Knight, etc.)
- 9 Genre nodes (Drama, Crime, Action, Sci-Fi, Thriller, Adventure, Fantasy, Animation, War)
- 60 IN_GENRE edges linking each movie to its primary genre
- 6 guided queries: all, top-rated (4.5+), genre-map, action-movies, most-rated (1000+ ratings), drama-scifi
- Movie properties: title, released (year), genres, avgRating (float), ratingCount, _label
- Exports: MOVIELENS_SAMPLE, MOVIELENS_QUERIES

### Air Routes Graph (airRoutesGraph.ts)
- 43 Airport nodes covering major world hubs (ATL, JFK, LAX, LHR, CDG, FRA, DXB, HND, SIN, etc.)
- 15 Country nodes, 6 Continent nodes (NA, EU, AP, ME, SA, AF)
- 83 ROUTE edges with real-world distances in km, 15 country CONTAINS edges, 43 airport CONTAINS edges
- CRITICAL: All 43 airports have accurate real-world float lat/lon coordinates for Phase 8
- 6 guided queries: all, us-airports, transatlantic, hub-analysis, european-network, long-haul (>5000km)
- Airport properties: code, icao, name, city, country, region, lat (float), lon (float), runways, elev
- Exports: AIR_ROUTES_SAMPLE, AIR_ROUTES_QUERIES

### Game of Thrones Graph (gotGraph.ts)
- 45 Character nodes (Ned Stark, Jon Snow, Daenerys, Tyrion, Cersei, Arya, and more)
- 8 Season nodes (Seasons 1-8)
- 63 INTERACTS edges with weight (int) and season (int) properties
- 170+ APPEARS_IN edges mapping characters to seasons they appear in
- 6 guided queries: all, season-1, most-connected, stark-network, cross-season, strongest-bonds
- Character properties: name, characterId, house, allegiance, _label
- Exports: GOT_SAMPLE, GOT_QUERIES

### Wikidata Nobel Prize Graph (wikidataGraph.ts)
- 36 Laureate nodes (Einstein, Curie, Bohr, Feynman, Mandela, MLK, Malala, Hemingway, Morrison, etc.)
- 6 Category nodes (Physics, Chemistry, Medicine, Literature, Peace, Economics)
- 10 Country nodes, 8 Institution nodes (MIT, Caltech, Harvard, Cambridge, Oxford, etc.)
- WON_PRIZE_IN edges with year property, BORN_IN edges, AFFILIATED_WITH edges
- 6 guided queries: all, physics-laureates, by-country, institutional-hubs, peace-prize, cross-discipline
- Laureate properties: name, gender, birthYear, birthCountry, wikidataId, category
- Exports: WIKIDATA_SAMPLE, WIKIDATA_QUERIES

## Verification Results

- All 4 TypeScript modules compile without errors (npx tsc --noEmit)
- All 8 exports confirmed present (4 GraphData constants + 4 GuidedQuery arrays)
- All 24 guided queries have key, label, description, cypher, expectedResultCount, filterFn, category, liveDescriptor
- Air Routes: 44 lat values and 44 lon values confirmed as floats
- Node ID prefixes confirmed: ml-, ar-, got-, wd-

## Deviations from Plan

None. Plan executed exactly as written.

- All 4 modules follow the exact fraudGraph.ts pattern (local clone helpers, const arrays, typed exports)
- Node ID prefix convention enforced throughout
- Air Routes lat/lon are accurate real-world float coordinates
- Each dataset has exactly 6 guided queries in Explore/Traverse/Analyze categories
- liveDescriptor fields provided on all non-trivial queries

## Self-Check: PASSED

All created files verified on disk:
- FOUND: frontend/src/data/movieLensGraph.ts
- FOUND: frontend/src/data/airRoutesGraph.ts
- FOUND: frontend/src/data/gotGraph.ts
- FOUND: frontend/src/data/wikidataGraph.ts

All commits verified in git log:
- FOUND commit: 3648e3c (feat(07-02): add MovieLens and Air Routes offline fallback modules)
- FOUND commit: 8ca2857 (feat(07-02): add Game of Thrones and Wikidata Nobel offline fallback modules)
