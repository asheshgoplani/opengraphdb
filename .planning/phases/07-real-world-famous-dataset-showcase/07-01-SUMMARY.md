---
phase: 07-real-world-famous-dataset-showcase
plan: 01
subsystem: data
tags: [python, bash, movielens, airroutes, got, wikidata, nobel-prize, csv, json-import]

requires:
  - phase: 06-production-demo-datasets
    provides: "JSON import format, seed-demo.sh pattern, datasets/ directory structure"

provides:
  - "4 download scripts fetching from canonical sources into data/cache/"
  - "4 Python conversion scripts producing OpenGraphDB JSON import files"
  - "4 dataset JSON files: movielens.json, airroutes.json, got.json, wikidata.json"
  - "Extended seed-demo.sh with --dataset flag for individual dataset seeding"
  - "Non-overlapping node ID ranges across all 4 datasets"

affects:
  - 07-real-world-famous-dataset-showcase
  - 08-revolutionary-graph-visualization
  - 09-ai-knowledge-graph-assistant

tech-stack:
  added: []
  patterns:
    - "Download scripts use set -euo pipefail with cache-skip-if-exists pattern"
    - "Conversion scripts use Python 3 stdlib only (csv, json, zipfile)"
    - "Node ID ranges: 0-99999 (MovieLens), 1M+ (Air Routes), 2M+ (GoT), 3M+ (Wikidata)"
    - "All dataset nodes carry _dataset and _label properties"
    - "seed-demo.sh uses DATASET arg with pre-flight JSON existence check"

key-files:
  created:
    - scripts/download-movielens.sh
    - scripts/download-airroutes.sh
    - scripts/download-got.sh
    - scripts/download-wikidata.sh
    - scripts/convert-movielens.py
    - scripts/convert-airroutes.py
    - scripts/convert-got.py
    - scripts/convert-wikidata.py
    - datasets/movielens.json
    - datasets/airroutes.json
    - datasets/got.json
    - datasets/wikidata.json
  modified:
    - scripts/seed-demo.sh
  deleted:
    - datasets/movies.json
    - datasets/social.json
    - datasets/fraud.json

key-decisions:
  - "MovieLens: top 8000 movies by rating count, no User nodes, Movie+Genre+IN_GENRE structure"
  - "Air Routes: actual CSV column names use type suffixes (lat:double, lon:double, code:string) - must use exact names"
  - "GoT: characters deduplicated across all 8 seasons using Id column as stable identifier"
  - "Wikidata Nobel: category field and affiliation names are multilingual dicts with 'en' key, not strings"
  - "ID ranges ensure zero collision when all 4 datasets coexist in same database"

patterns-established:
  - "Download scripts: cache-skip-if-exists, set -euo pipefail, create data/cache/ if needed"
  - "Conversion scripts: stdlib only, print summary stats, use non-overlapping ID ranges"
  - "seed-demo.sh: pre-flight JSON check, individual dataset support via positional arg"

requirements-completed: [SHOWCASE-01, SHOWCASE-02, SHOWCASE-03, SHOWCASE-04]

duration: 35min
completed: 2026-03-02
---

# Phase 7 Plan 01: Data Download and Conversion Pipeline Summary

**4 real-world famous datasets (MovieLens top 8K, full Air Routes, GoT 8 seasons, Nobel Prize) downloaded, converted to OpenGraphDB JSON import format, and importable via extended seed pipeline**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-03-02T00:55:00Z
- **Completed:** 2026-03-02T01:30:00Z
- **Tasks:** 2 of 2
- **Files modified:** 15

## Accomplishments

- Created 4 download scripts that fetch from canonical sources (GroupLens, GitHub, Nobel API) with cache-skip-if-exists behavior
- Created 4 Python conversion scripts (stdlib only) that produce valid OpenGraphDB JSON with non-overlapping node IDs
- Generated 4 dataset JSON files: 8019 MovieLens nodes, 3748 Air Routes nodes, 414 GoT nodes, 1160 Wikidata nodes
- Extended seed-demo.sh with optional dataset argument and pre-flight JSON existence check
- Removed 3 old synthetic datasets (movies.json, social.json, fraud.json)

## Task Commits

Each task was committed atomically:

1. **Task 1: Download scripts, conversion scripts, and 4 dataset JSONs** - `bfa8719` (feat)
2. **Task 2: Extended seed-demo.sh with --dataset flag** - `c8b812c` (feat)

## Files Created/Modified

- `scripts/download-movielens.sh` - Downloads ml-25m.zip from GroupLens, extracts movies.csv and ratings.csv
- `scripts/download-airroutes.sh` - Downloads two air-routes CSVs from krlawrence/graph GitHub
- `scripts/download-got.sh` - Downloads 16 GoT season CSV files from mathbeveridge/gameofthrones GitHub
- `scripts/download-wikidata.sh` - Downloads Nobel Prize laureates JSON from api.nobelprize.org
- `scripts/convert-movielens.py` - Top 8000 movies by rating count; Movie+Genre nodes; no User nodes
- `scripts/convert-airroutes.py` - Airport/Country/Continent nodes with float lat/lon; route+contains edges
- `scripts/convert-got.py` - 406 unique Character nodes across 8 seasons; APPEARS_IN+INTERACTS edges
- `scripts/convert-wikidata.py` - 1018 Laureates + 6 Categories + 86 Countries + 50 Institutions; 3 edge types
- `datasets/movielens.json` - 8019 nodes, 18525 edges (ID range: 0-8018)
- `datasets/airroutes.json` - 3748 nodes, 57645 edges (ID range: 1000000-1003747)
- `datasets/got.json` - 414 nodes, 5077 edges (ID range: 2000000-2000413)
- `datasets/wikidata.json` - 1160 nodes, 2457 edges (ID range: 3000000-3001159)
- `scripts/seed-demo.sh` - Extended with dataset argument, pre-flight check, and count summary

## Decisions Made

- **MovieLens uses ml-25m (full dataset):** Provides rating counts for selecting the true top 8000 most-rated movies. The download is large (~250MB) but the conversion is straightforward and the resulting JSON is ~30MB.
- **Air Routes column name discovery:** The CSV uses typed column suffixes (`lat:double`, `code:string`, `runways:int`) not plain names. Used a `get_col` helper that tries multiple variants.
- **Nobel Prize multilingual data structure:** The API returns `category`, `fullName`, and `affiliation.name` as dicts with language keys (`{"en": "Chemistry"}`), not plain strings. The `get_en()` helper extracts the English value.
- **GoT deduplication:** Characters are identified by the `Id` column (e.g., "NED", "DAENERYS"), not `Label`. This correctly deduplicates across seasons.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Air Routes column name parsing**
- **Found during:** Task 1 (convert-airroutes.py)
- **Issue:** Initial script used column names without type suffixes (`lat`, `code`). The CSV uses typed names (`lat:double`, `code:string`) so all values were empty.
- **Fix:** Discovered actual column names by reading the CSV header, implemented `get_col()` helper with typed column names
- **Files modified:** scripts/convert-airroutes.py
- **Verification:** All 3504 airports have correct lat/lon float values
- **Committed in:** bfa8719 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Nobel Prize multilingual data structure parsing**
- **Found during:** Task 1 (convert-wikidata.py)
- **Issue:** Initial script treated category and affiliation name as strings. Actual API response uses multilingual dicts (`{"en": "Economic Sciences", "no": "Okonomi"}`). Result: 0 countries and 0 institutions created.
- **Fix:** Inspected actual JSON structure, implemented `get_en()` helper, corrected all field accesses
- **Files modified:** scripts/convert-wikidata.py
- **Verification:** 86 countries and 50 institutions created correctly
- **Committed in:** bfa8719 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug, discovered during implementation)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

- MovieLens ml-25m.zip download (~250MB) took approximately 2 minutes at ~1.8 MB/s. Script uses cache-skip-if-exists so subsequent runs are instant.
- Nobel Prize API category codes differ from expected short codes (e.g., "eco"). Actual data uses full English names ("Economic Sciences") in a multilingual dict. Converter maps to canonical short codes for consistency.

## User Setup Required

None - no external service configuration required. All data downloads from public APIs.

## Next Phase Readiness

- All 4 dataset JSON files are in `datasets/` and ready for import via `bash scripts/seed-demo.sh`
- Air Routes airports preserve float lat/lon properties, ready for geographic visualization in Phase 8
- GoT character interaction network with season-level edges ready for visualization
- Nobel Prize laureate graph with affiliation and country relationships ready for AI assistant queries in Phase 9

---
*Phase: 07-real-world-famous-dataset-showcase*
*Completed: 2026-03-02*

## Self-Check: PASSED

All files exist and all commits verified:
- scripts/download-movielens.sh: FOUND
- scripts/convert-airroutes.py: FOUND
- datasets/movielens.json: FOUND
- datasets/airroutes.json: FOUND
- datasets/got.json: FOUND
- datasets/wikidata.json: FOUND
- .planning/phases/07-real-world-famous-dataset-showcase/07-01-SUMMARY.md: FOUND
- Commit bfa8719: FOUND
- Commit c8b812c: FOUND
