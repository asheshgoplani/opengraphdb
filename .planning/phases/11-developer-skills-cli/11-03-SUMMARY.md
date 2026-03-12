---
phase: 11-developer-skills-cli
plan: "03"
subsystem: skills
tags: [data-import, csv, json, rdf, cypher-generation, schema-detection, validation]

# Dependency graph
requires:
  - phase: 10-mcp-server
    provides: MCP tools (browse_schema, execute_cypher, import_rdf, list_datasets, search_nodes) used by import workflow
provides:
  - data-import skill with SKILL.md and 3 rule files for CSV, JSON, and RDF import assistance
  - Schema detection rules for 3 file formats with type inference
  - 7 Cypher generation patterns (single, batch, multi-label, relationship, nested, bulk API, RDF)
  - 10 data quality validation checks with pre/post-import checklists
affects: [11-04-evals, 11-05-readme, data-import-workflows]

# Tech tracking
tech-stack:
  added: []
  patterns: [MERGE-based idempotent imports, two-pass node-then-relationship strategy, UNWIND batching]

key-files:
  created:
    - skills/data-import/SKILL.md
    - skills/data-import/rules/format-detection.md
    - skills/data-import/rules/import-patterns.md
    - skills/data-import/rules/validation-checks.md
  modified: []

key-decisions:
  - "MERGE-only import policy: all generated Cypher uses MERGE for idempotency, never bare CREATE for data import"
  - "RDF delegation: RDF files are never manually converted to Cypher, always delegated to import_rdf MCP tool"
  - "Two-pass import ordering: nodes created first in all cases, relationships created second to avoid missing endpoint errors"
  - "Batch size tiers: <100 individual, 100-10K UNWIND batches of 100-500, 10K+ POST /import API"

patterns-established:
  - "Pre-import checklist pattern: always present summary (counts, schema, warnings) and require user confirmation"
  - "Post-import verification pattern: count queries per label, relationship count, sample data check"
  - "Property key normalization: snake_case, lowercase, no special characters"

requirements-completed: [SKILL-04]

# Metrics
duration: 4min
completed: 2026-03-12
---

# Phase 11 Plan 03: Data Import Skill Summary

**Data-import skill with CSV/JSON/RDF schema detection, 7 Cypher generation patterns, and 10 validation checks for idempotent graph imports**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T10:08:41Z
- **Completed:** 2026-03-12T10:12:30Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Created complete data-import skill covering all 3 required formats (CSV, JSON, RDF) with automatic schema detection, type inference, and Cypher generation
- Produced 651 lines of AI instruction content across SKILL.md and 3 rule files (well above 380-line minimum)
- Defined 7 distinct import patterns including single-row, UNWIND batch, multi-label, relationship, nested JSON, bulk API, and RDF delegation
- Defined 10 validation checks covering schema compatibility, uniqueness, type consistency, nulls, string length, relationship endpoints, encoding, duplicates, date formats, and numeric ranges

## Task Commits

Each task was committed atomically:

1. **Task 1: Create data-import skill with SKILL.md and 3 rule files** - `b830dda` (feat)

## Files Created/Modified
- `skills/data-import/SKILL.md` - Master skill definition (85 lines): 8-step import workflow, MCP tool reference table, data type mapping, error handling
- `skills/data-import/rules/format-detection.md` - Format detection rules (173 lines): CSV delimiter/header/type detection, JSON structure classification, RDF format identification, encoding checks
- `skills/data-import/rules/import-patterns.md` - Cypher generation patterns (240 lines): 7 import patterns with string escaping, type formatting, batch size guidelines, error recovery
- `skills/data-import/rules/validation-checks.md` - Data quality validation (153 lines): 10 validation rules, pre-import checklist template, post-import verification steps

## Decisions Made
- All import Cypher uses MERGE for idempotency (never bare CREATE for data import rows)
- RDF files are never manually converted to Cypher; always delegated to the import_rdf MCP tool
- Two-pass import ordering enforced: nodes first, relationships second
- Batch size tiers: <100 individual statements, 100-10K UNWIND batches, 10K+ POST /import API
- Property keys normalized to snake_case lowercase without special characters

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data-import skill complete and ready for eval framework (Plan 11-04)
- Together with ogdb-cypher, graph-explore, and schema-advisor skills (Plans 11-01, 11-02), all 4 skills will be ready for eval YAML test cases
- Package README (Plan 11-05) can reference data-import's import workflow and format support

## Self-Check: PASSED

All 4 created files verified on disk. Task commit b830dda verified in git log.

---
*Phase: 11-developer-skills-cli*
*Completed: 2026-03-12*
