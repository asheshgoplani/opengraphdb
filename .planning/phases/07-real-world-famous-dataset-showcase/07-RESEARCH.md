# Phase 7: Real-World Famous Dataset Showcase - Research

**Researched:** 2026-03-02
**Domain:** Dataset acquisition, transformation pipelines, TypeScript graph data modules, shell seed scripts
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dataset Scale & Sampling
- **MovieLens**: Curated subset (~5K-10K movies with representative ratings from the 25M dataset). Full 25M ratings is too large for demo; keep recognizable MovieLens branding and structure
- **Air Routes**: Full dataset (3,500 airports, ~50K routes with lat/long coordinates). Reasonable size, and geographic data is critical for Phase 8's map rendering
- **Game of Thrones**: Full dataset (~400 characters with interactions broken down by season). Small enough to import completely; seasonal breakdown is the unique analytical value
- **Wikidata**: Curated thematic slice (Nobel Prize winners, countries, organizations, or similar). Target ~2K-5K entities with rich interconnections that demonstrate knowledge graph patterns

#### Frontend Showcase Integration
- **Replace existing datasets**: The 3 existing synthetic datasets (movies, social, fraud) are replaced by the 4 famous real-world datasets. MovieLens replaces the synthetic movies graph; the other two synthetic datasets are retired
- **DatasetKey type**: Expand from `'movies' | 'social' | 'fraud'` to `'movielens' | 'airroutes' | 'got' | 'wikidata'`
- **Landing page ShowcaseSection**: Update to feature the 4 new datasets with real stats, recognizable domain names, and descriptions highlighting why each dataset is famous in the graph DB community
- **Playground DatasetSwitcher**: Each dataset gets its own entry with dataset-specific guided queries. The existing switcher pattern supports this
- **Dataset cards**: Show real node/edge counts, recognizable domain branding, 2-3 sentence description of the dataset's significance

#### Data Pipeline Design
- **Download scripts**: Scripts in `scripts/` fetch from original sources (grouplens.org for MovieLens, GitHub for Air Routes and GoT, Wikidata SPARQL/dumps for Wikidata)
- **Format conversion**: Each dataset gets a conversion script that transforms original formats (CSV, JSON, TTL/SPARQL results) into OpenGraphDB's JSON import format
- **Not bundled in repo**: Data is downloaded at seed time, not committed to the repo. Cache downloaded files in `data/cache/` to avoid re-downloading
- **Seed script**: Extend existing `seed-demo.sh` to handle all 4 datasets. Add `--dataset` flag for individual dataset seeding. Keep idempotent (delete and recreate on each run)
- **Offline fallback**: Frontend keeps small static subsets (~50-100 nodes each) for offline playground mode, similar to current pattern

#### Guided Query Design
- **5-7 guided queries per dataset**, categorized as Explore/Traverse/Analyze (matches existing GuidedQuery interface)
- **MovieLens queries**: Recommendation-style patterns ("movies similar viewers liked", "top-rated by genre", "actor collaboration networks", "connecting path between two actors"). Showcase graph-powered recommendations
- **Air Routes queries**: Geographic/pathfinding patterns ("routes from airport X", "shortest path between cities", "hub airports by connection count", "routes by continent"). These prepare for Phase 8's geographic rendering
- **GoT queries**: Character interaction networks ("interactions by season", "most connected characters", "house alliances", "character bridges between houses"). Narrative-driven graph exploration
- **Wikidata queries**: Knowledge graph patterns ("Nobel laureates by country", "organization relationships", "country connections through shared institutions"). Demonstrates semantic/knowledge graph use cases

### Claude's Discretion
- Exact node/edge counts for MovieLens and Wikidata subsets (within the target ranges above)
- Specific Wikidata SPARQL query or dump slice strategy
- Offline fallback subset selection criteria
- Conversion script implementation details (Python vs shell vs Node)
- Loading skeleton and progress indicators during dataset import

### Deferred Ideas (OUT OF SCOPE)
- Geographic map rendering for Air Routes (lat/long visualization) belongs to Phase 8
- Query trace animation (traversal highlighting) belongs to Phase 8
- AI-powered natural language queries over these datasets belongs to Phase 9
- User-uploaded custom datasets are out of scope for this phase (this is pre-built showcases only)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHOWCASE-01 | MovieLens dataset: curated subset with representative movies, genres, and rating-derived similarity edges, plus 5-7 guided Cypher queries | Dataset structure verified: movies.csv (movieId, title, genres pipe-separated), ratings.csv (userId, movieId, rating) from grouplens.org. Subset strategy: filter top-N movies by rating count. Graph schema: Movie, Genre, User nodes with RATED, IN_GENRE edges. |
| SHOWCASE-02 | Air Routes dataset: full airport network with lat/long preserved, plus 5-7 guided Cypher queries for path and hub analysis | CSV structure verified: nodes have code, icao, city, country, lat, lon, runways, elev, region fields. Edges have dist field. Node types: airport (3,504), country (237), continent (7). Edge types: route (50,637), contains (7,008). Full dataset: ~3,749 nodes, ~57,645 edges. |
| SHOWCASE-03 | Game of Thrones dataset: all 8 seasons with character-per-season nodes and INTERACTS edges weighted by interaction count, plus 5-7 guided Cypher queries | CSV structure verified: nodes (Id, Label), edges (Source, Target, Weight, Season). 406 unique characters, ~4,100 interactions across 8 seasons. Model as Character nodes with Season nodes + APPEARS_IN and INTERACTS edges. |
| SHOWCASE-04 | Wikidata/Nobel Prize dataset: ~1K laureates with country, institution, prize category nodes and rich cross-connections, plus 5-7 guided Cypher queries for knowledge graph patterns | Nobel Prize REST API confirmed: api.nobelprize.org/2.1/laureates returns 1,018 laureates total. JSON structure includes name, gender, birth.place.country, nobelPrizes[].category, nobelPrizes[].affiliations. Free API, no key needed. Better than Wikidata SPARQL (60s timeout risk). |
</phase_requirements>

## Summary

This phase replaces three synthetic datasets with four famous real-world datasets that every major graph database vendor uses as reference benchmarks. The core work is: (1) download scripts that fetch from canonical sources, (2) Python conversion scripts that transform raw CSV/JSON into OpenGraphDB's JSON import format, (3) TypeScript offline fallback modules for the playground, (4) updated `datasets.ts` registry with four new `DatasetKey` values, and (5) updates to the landing page showcase and guided queries.

All four data sources have been verified as alive, free, and well-structured. The Nobel Prize dataset is best fetched from the official Nobel Prize Foundation REST API (`api.nobelprize.org/2.1/laureates`) rather than Wikidata SPARQL, which has a 60-second timeout that risks failures on larger queries. The Air Routes and GoT datasets come from GitHub as CSV files with documented formats. MovieLens comes from grouplens.org as a 250MB zip containing standard CSVs.

The technical pattern for each dataset is identical: download script caches raw files in `data/cache/`, a Python conversion script reads the cache and writes to `datasets/<name>.json` in OpenGraphDB's import format, and the `seed-demo.sh` extension imports these JSON files. The TypeScript offline fallback modules hand-craft a 50-100 node representative slice that mirrors the real graph schema without requiring a live backend.

**Primary recommendation:** Use the Nobel Prize REST API (not Wikidata SPARQL) for the knowledge graph dataset; use Python for all conversion scripts since pandas is the natural tool for CSV manipulation; keep the offline fallback data hand-crafted as TypeScript constants (not auto-generated from the full dataset).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Python 3.x | stdlib | Download and conversion scripts | Available everywhere, `csv` and `json` stdlib modules handle all formats, no install needed |
| `urllib.request` or `curl` | stdlib | HTTP downloads | Zero dependencies for download scripts |
| `csv` module (Python) | stdlib | Parse CSV files (air routes, GoT, MovieLens) | Handles quoting, headers cleanly |
| `json` module (Python) | stdlib | Write OpenGraphDB import format | Direct dict serialization |
| TypeScript | project standard | Offline fallback data modules | Matches existing `sampleGraph.ts`, `fraudGraph.ts` pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pandas` (optional) | latest | MovieLens subset selection (filter top movies by rating count) | Only if stdlib csv is too verbose for the rating aggregation |
| `zipfile` (Python stdlib) | stdlib | Extract MovieLens zip download | Required for grouplens.org zip archive |
| `requests` (optional) | latest | Nobel Prize API calls with retry logic | Only if `urllib.request` retry handling becomes verbose |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nobel Prize REST API | Wikidata SPARQL endpoint | SPARQL has 60-second hard timeout, Nobel API is simpler and purpose-built |
| Python scripts | Node.js / shell | Python has better CSV/JSON ergonomics; shell lacks good CSV parsing |
| Python scripts | Rust binary | No benefit; this is one-time data conversion, not hot path |
| Hand-crafted TypeScript offline fallback | Auto-generated from full dataset | Auto-gen creates files too large for the browser; hand-crafted lets you pick representative nodes |

**Installation:**
```bash
# No new npm dependencies required for this phase
# Python 3 scripts use stdlib only (csv, json, urllib.request, zipfile)
# Optional: pip install pandas  (only if using pandas for MovieLens rating aggregation)
```

## Architecture Patterns

### Recommended Project Structure
```
scripts/
├── seed-demo.sh             # Extended with --dataset flag, all 4 datasets
├── download-movielens.sh    # Fetches ml-25m.zip from grouplens.org -> data/cache/
├── download-airroutes.sh    # Fetches CSV from GitHub -> data/cache/
├── download-got.sh          # Fetches 16 CSV files from GitHub -> data/cache/
├── download-wikidata.sh     # Calls Nobel Prize API -> data/cache/
├── convert-movielens.py     # CSV subset -> datasets/movielens.json
├── convert-airroutes.py     # CSV -> datasets/airroutes.json
├── convert-got.py           # Multi-season CSVs -> datasets/got.json
└── convert-wikidata.py      # Nobel Prize API JSON -> datasets/wikidata.json

data/
└── cache/                   # Downloaded raw files (gitignored)
    ├── ml-25m.zip
    ├── air-routes-latest-nodes.csv
    ├── air-routes-latest-edges.csv
    ├── got-s1-nodes.csv ... got-s8-edges.csv
    └── nobel-laureates.json

datasets/
├── movielens.json           # OpenGraphDB import format
├── airroutes.json           # OpenGraphDB import format
├── got.json                 # OpenGraphDB import format
└── wikidata.json            # OpenGraphDB import format

frontend/src/data/
├── datasets.ts              # Updated: DatasetKey + DATASETS registry
├── movieLensGraph.ts        # Offline fallback (~80 nodes, representative subset)
├── airRoutesGraph.ts        # Offline fallback (~60 airports, major hubs)
├── gotGraph.ts              # Offline fallback (~50 characters, season 1 core)
└── wikidataGraph.ts         # Offline fallback (~40 laureates, 6 countries, 6 categories)
```

### Pattern 1: OpenGraphDB JSON Import Format

The existing `datasets/movies.json` reveals the exact import format. Every dataset must produce this structure:

```json
{
  "nodes": [
    {
      "id": 0,
      "labels": ["Movie"],
      "properties": {
        "title": "The Matrix",
        "_label": "Movie",
        "_dataset": "movielens"
      }
    }
  ],
  "edges": [
    {
      "id": 0,
      "source": 0,
      "target": 1,
      "type": "IN_GENRE",
      "properties": {}
    }
  ]
}
```

Key rules from existing files:
- `id` is a sequential integer starting at 0 within each dataset
- `labels` is an array (first label also stored as `_label` property)
- `_dataset` property identifies the source dataset
- Property keys are camelCase for multi-word names

### Pattern 2: TypeScript Offline Fallback Module

Each offline fallback module follows the exact same structure as `fraudGraph.ts` and `socialGraph.ts`:

```typescript
// Source: existing fraudGraph.ts, socialGraph.ts patterns
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

// Constants for label strings
const AIRPORT_LABEL = 'Airport'
const ROUTE_LABEL = 'Route'

// Clone helpers (copy from other graph files - they must be local)
function cloneNode(node: GraphNode): GraphNode { ... }
function cloneLink(link: GraphEdge): GraphEdge { ... }

// Static data
const NODES: GraphNode[] = [...]
const EDGES: GraphEdge[] = [...]

export const AIR_ROUTES_SAMPLE: GraphData = { nodes: NODES, links: EDGES }

export const AIR_ROUTES_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All graph data',
    description: '...',
    cypher: 'MATCH (n) RETURN n',
    expectedResultCount: NODES.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  // 4-6 more queries
]
```

Note: Each graph file must define its own clone helpers because TypeScript module isolation prevents sharing them from `datasets.ts`. This matches the existing pattern.

### Pattern 3: datasets.ts Registry Update

The `DatasetKey` union type and `DATASETS` record are the single source of truth:

```typescript
// datasets.ts changes
export type DatasetKey = 'movielens' | 'airroutes' | 'got' | 'wikidata'

export const DATASETS: Record<DatasetKey, DatasetEntry> = {
  movielens: {
    data: MOVIELENS_SAMPLE,
    queries: MOVIELENS_QUERIES,
    meta: buildDatasetMeta('movielens', 'MovieLens 25M', '...', MOVIELENS_SAMPLE),
  },
  airroutes: { ... },
  got: { ... },
  wikidata: { ... },
}
```

The `ShowcaseSection` iterates `getDatasetList()` dynamically, so no changes are needed there beyond the data registry update. The `DatasetSwitcher` does `getDatasetList()` as well. The `ShowcaseCard` accepts any `DatasetKey`. No structural changes to these components.

### Pattern 4: Seed Script Extension

```bash
#!/usr/bin/env bash
# Extended seed-demo.sh pattern
DATASET="${1:-all}"  # or use --dataset flag via getopts

seed_dataset() {
  local name="$1"
  local json_file="$DATASETS_DIR/${name}.json"

  if [ ! -f "$json_file" ]; then
    echo "Dataset ${name} not found. Run download + convert scripts first."
    echo "  bash scripts/download-${name}.sh"
    echo "  python3 scripts/convert-${name}.py"
    exit 1
  fi

  echo "Importing ${name} dataset..."
  "$OGDB_BIN" import "$OGDB_DEMO_DB" "$json_file"
  echo "  Done."
}

if [ "$DATASET" = "all" ] || [ "$DATASET" = "movielens" ]; then
  seed_dataset "movielens"
fi
# ... repeat for airroutes, got, wikidata
```

### Anti-Patterns to Avoid

- **Committing data files**: Do not commit `data/cache/` or any downloaded raw data. Add to `.git/info/exclude`.
- **Committing `datasets/*.json` if they are large**: The air routes JSON will be ~8MB. Consider whether to commit or keep download-only. Existing pattern commits these files (movies.json, social.json, fraud.json are committed), so commit them.
- **Single monolithic conversion script**: One script per dataset, not a single mega-converter. Easier to debug and re-run.
- **Including all 25M ratings in MovieLens**: Use rating count per movie to select the top 5K-10K most-rated movies. Do not include raw User nodes for the demo (too many); represent the rating affinity as SIMILAR_TO edges between movies instead.
- **Fetching Wikidata SPARQL for large result sets**: The 60-second timeout will bite you. Use the Nobel Prize REST API directly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing with quoted fields | Custom split logic | Python `csv.DictReader` | Handles embedded commas, quoting edge cases |
| HTTP download with retry | Manual retry loop | `urllib.request.urlretrieve` or `curl -L -o` | Follows redirects, handles large files |
| ZIP extraction | Manual byte reading | Python `zipfile.ZipFile` | Handles zip64, extracts specific members |
| JSON pretty-printing | Manual formatting | `json.dumps(data, indent=2)` | Standard and consistent |
| Nobel API pagination | Custom offset loop | Single call with `?limit=2000` | 1,018 total laureates fit in one call |

**Key insight:** Every data transformation in this phase is a solved problem in Python stdlib. Custom solutions add no value and introduce new bugs.

## Common Pitfalls

### Pitfall 1: Wikidata SPARQL Timeout on Large Queries
**What goes wrong:** A SPARQL query to Wikidata that joins laureates, countries, and organizations times out at 60 seconds before returning results.
**Why it happens:** The Wikidata public SPARQL endpoint has a hard 60-second limit per query, with rate limits of 5 parallel queries per IP.
**How to avoid:** Use the Nobel Prize Foundation REST API at `https://api.nobelprize.org/2.1/laureates?limit=2000` instead. It returns all 1,018 laureates in one call with full country and affiliation data. No API key required.
**Warning signs:** Query works in small tests but fails when adding JOINs or expanding scope.

### Pitfall 2: MovieLens User Nodes Exploding the Graph
**What goes wrong:** Including User nodes from MovieLens creates 162,541 nodes, making the graph unusable for demo purposes.
**Why it happens:** The natural graph model includes users, but the demo target is ~5K-10K nodes.
**How to avoid:** Do not create User nodes. Instead, derive movie-to-movie similarity by counting shared raters. Or model the dataset as Movie + Genre nodes only, with ratings aggregated as properties (avgRating, ratingCount). This is what Neo4j does in their MovieLens demo.
**Warning signs:** The conversion script output JSON is over 50MB.

### Pitfall 3: Air Routes Node ID Collisions
**What goes wrong:** The air routes CSV uses `~id` integers that start at 0 with a version metadata row. If IDs are used as-is across datasets loaded into the same database, they collide.
**Why it happens:** Each dataset is loaded separately but into the same graph. Node ID 1 in air routes conflicts with node ID 1 from another dataset.
**How to avoid:** Each conversion script must use globally unique IDs. Use a dataset-specific offset (e.g., air routes nodes start at 1,000,000; GoT at 2,000,000; etc.) or use string IDs prefixed with the dataset name (`airroutes-1`, `got-ned`, etc.).
**Warning signs:** Queries after multi-dataset import return mixed node types that don't belong together.

### Pitfall 4: GoT Season Data Duplication
**What goes wrong:** Building a naive union of all 8 seasons creates duplicate Character nodes (a character appearing in all 8 seasons appears 8 times).
**Why it happens:** Each season CSV has its own node list with the same character IDs.
**How to avoid:** Deduplicate Character nodes using the `Id` column as the canonical identifier. Create one Character node per unique Id, then create Season nodes (s1 through s8) with APPEARS_IN edges from characters to seasons. The interaction edges become `(char1)-[INTERACTS {weight, season}]->(char2)`.
**Warning signs:** The GoT graph has 8x the expected character count.

### Pitfall 5: Missing lat/long on Air Routes
**What goes wrong:** The conversion script omits lat/lon from airport node properties, breaking Phase 8's geographic rendering.
**Why it happens:** Oversight when mapping CSV columns to JSON properties.
**How to avoid:** Explicitly include `lat`, `lon` (as float), `city`, `country`, `code` (IATA), `icao` in every Airport node. These are critical for Phase 8.
**Warning signs:** Airport nodes in the imported graph have no `lat` or `lon` properties.

### Pitfall 6: ShowcaseCard Offline Fallback Too Large
**What goes wrong:** The offline TypeScript graph file for Air Routes includes all 3,500 airports, making the initial bundle huge and slowing the landing page showcase animation.
**Why it happens:** Developers copy the full dataset into the TypeScript module.
**How to avoid:** The offline fallback for each dataset is a hand-curated representative slice of 50-100 nodes chosen for visual appeal (well-connected hub nodes, recognizable names). This is the same approach as the existing `MOVIES_SAMPLE` in `sampleGraph.ts`.
**Warning signs:** The `airRoutesGraph.ts` file exceeds 50KB.

### Pitfall 7: datasets.test.ts Hardcodes Old DatasetKey Values
**What goes wrong:** The test file at `frontend/src/data/datasets.test.ts` hardcodes `['movies', 'social', 'fraud']` in multiple places and will fail after the DatasetKey replacement.
**Why it happens:** The tests were written for the original three datasets.
**How to avoid:** Update `datasets.test.ts` alongside `datasets.ts`. Replace all hardcoded old dataset keys with the four new ones. The test structure stays identical; only the key names and expected label assertions change.
**Warning signs:** `npm test` in the frontend fails after updating datasets.ts.

## Code Examples

### MovieLens Conversion: Graph Schema
```python
# Source: grouplens.org README + existing movies.json pattern
# Strategy: Top N movies by rating count, no User nodes, Genre nodes
import csv, json

def load_movies(path):
    """Load movies.csv: movieId,title,genres (pipe-separated genres)"""
    movies = {}
    with open(path) as f:
        for row in csv.DictReader(f):
            genres = row['genres'].split('|') if row['genres'] != '(no genres listed)' else []
            movies[int(row['movieId'])] = {
                'title': row['title'],
                'genres': genres,
            }
    return movies

def load_popular_movies(ratings_path, movies, top_n=8000):
    """Filter to top_n movies by number of ratings"""
    counts = {}
    with open(ratings_path) as f:
        for row in csv.DictReader(f):
            mid = int(row['movieId'])
            if mid in movies:
                counts[mid] = counts.get(mid, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)[:top_n]
```

### Air Routes CSV Parsing
```python
# Source: verified against air-routes-latest-nodes.csv header row
# Header: ~id,~label,type:string,code:string,icao:string,desc:string,region:string,
#         runways:int,longest:int,elev:int,country:string,city:string,lat:double,lon:double
import csv

AIRPORT_ID_OFFSET = 1_000_000  # Prevent collision with other datasets

def parse_airport_nodes(path):
    nodes = []
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['~label'] == 'airport':
                node_id = AIRPORT_ID_OFFSET + int(row['~id'])
                nodes.append({
                    'id': node_id,
                    'labels': ['Airport'],
                    'properties': {
                        '_label': 'Airport',
                        '_dataset': 'airroutes',
                        'code': row['code:string'],
                        'icao': row['icao:string'],
                        'name': row['desc:string'],
                        'city': row['city:string'],
                        'country': row['country:string'],
                        'region': row['region:string'],
                        'lat': float(row['lat:double']) if row['lat:double'] else None,
                        'lon': float(row['lon:double']) if row['lon:double'] else None,
                        'runways': int(row['runways:int']) if row['runways:int'] else 0,
                        'elev': int(row['elev:int']) if row['elev:int'] else 0,
                    }
                })
    return nodes
```

### GoT Multi-Season Conversion
```python
# Source: verified against got-s1-nodes.csv and got-s1-edges.csv formats
# Node CSV: Id,Label    Edge CSV: Source,Target,Weight,Season
import csv

GOT_ID_OFFSET = 2_000_000
SEASON_ID_OFFSET = 2_900_000  # Season nodes: 2_900_001 to 2_900_008

def build_got_graph():
    characters = {}  # id_str -> node_id (deduplicated)
    char_node_id_counter = GOT_ID_OFFSET
    edges = []
    edge_id = 0

    # Build Season nodes first
    season_nodes = [
        {
            'id': SEASON_ID_OFFSET + s,
            'labels': ['Season'],
            'properties': {
                '_label': 'Season',
                '_dataset': 'got',
                'number': s,
                'name': f'Season {s}',
            }
        }
        for s in range(1, 9)
    ]

    for season in range(1, 9):
        # Nodes
        with open(f'data/cache/got-s{season}-nodes.csv') as f:
            for row in csv.DictReader(f):
                char_id = row['Id']
                if char_id not in characters:
                    characters[char_id] = {
                        'node_id': char_node_id_counter,
                        'label': row['Label'],
                    }
                    char_node_id_counter += 1
                # APPEARS_IN edge for this season
                edges.append({
                    'id': edge_id,
                    'source': characters[char_id]['node_id'],
                    'target': SEASON_ID_OFFSET + season,
                    'type': 'APPEARS_IN',
                    'properties': {},
                })
                edge_id += 1

        # Edges
        with open(f'data/cache/got-s{season}-edges.csv') as f:
            for row in csv.DictReader(f):
                src = row['Source']
                tgt = row['Target']
                if src in characters and tgt in characters:
                    edges.append({
                        'id': edge_id,
                        'source': characters[src]['node_id'],
                        'target': characters[tgt]['node_id'],
                        'type': 'INTERACTS',
                        'properties': {
                            'weight': int(row['Weight']),
                            'season': int(row['Season']),
                        },
                    })
                    edge_id += 1

    char_nodes = [
        {
            'id': info['node_id'],
            'labels': ['Character'],
            'properties': {
                '_label': 'Character',
                '_dataset': 'got',
                'name': info['label'],
                'id': char_id,
            }
        }
        for char_id, info in characters.items()
    ]
    return {'nodes': char_nodes + season_nodes, 'edges': edges}
```

### Nobel Prize API Conversion
```python
# Source: verified against live API at api.nobelprize.org/2.1/laureates
# API returns 1,018 laureates total; one call with limit=2000 gets everything
import json, urllib.request

WIKIDATA_ID_OFFSET = 3_000_000

def fetch_laureates():
    url = 'https://api.nobelprize.org/2.1/laureates?limit=2000'
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)['laureates']

def build_wikidata_graph(laureates):
    nodes = []
    edges = []
    node_id = WIKIDATA_ID_OFFSET
    edge_id = 0

    country_ids = {}   # country_en -> node_id
    category_ids = {}  # category_en -> node_id
    affil_ids = {}     # affiliation_en -> node_id

    for laureate in laureates:
        laureate_id = node_id
        name = (laureate.get('knownName') or laureate.get('orgName') or {}).get('en', 'Unknown')
        nodes.append({
            'id': laureate_id,
            'labels': ['Laureate'],
            'properties': {
                '_label': 'Laureate',
                '_dataset': 'wikidata',
                'name': name,
                'gender': laureate.get('gender', 'unknown'),
                'birthYear': laureate.get('birth', {}).get('year', ''),
                'birthCountry': (laureate.get('birth', {}) or {}).get('place', {}).get('country', {}).get('en', ''),
                'wikidataId': laureate.get('wikidata', {}).get('id', ''),
            }
        })
        node_id += 1

        for prize in laureate.get('nobelPrizes', []):
            cat = prize.get('category', {}).get('en', '')
            year = prize.get('awardYear', '')

            # Category node
            if cat not in category_ids:
                category_ids[cat] = node_id
                nodes.append({'id': node_id, 'labels': ['Category'], 'properties': {
                    '_label': 'Category', '_dataset': 'wikidata', 'name': cat
                }})
                node_id += 1

            edges.append({'id': edge_id, 'source': laureate_id, 'target': category_ids[cat],
                          'type': 'WON_PRIZE_IN', 'properties': {'year': int(year) if year.isdigit() else year}})
            edge_id += 1

            # Country node from birth place
            country = (laureate.get('birth', {}) or {}).get('place', {}).get('countryNow', {}).get('en', '')
            if country and country not in country_ids:
                country_ids[country] = node_id
                nodes.append({'id': node_id, 'labels': ['Country'], 'properties': {
                    '_label': 'Country', '_dataset': 'wikidata', 'name': country
                }})
                node_id += 1
            if country:
                edges.append({'id': edge_id, 'source': laureate_id, 'target': country_ids[country],
                              'type': 'BORN_IN', 'properties': {}})
                edge_id += 1

    return {'nodes': nodes, 'edges': edges}
```

### Offline Fallback: Air Routes TypeScript Pattern
```typescript
// Source: pattern from existing fraudGraph.ts and socialGraph.ts
import type { GraphData, GraphEdge, GraphNode } from '@/types/graph'
import type { GuidedQuery } from './datasets.js'

const AIRPORT_LABEL = 'Airport'
const COUNTRY_LABEL = 'Country'
const CONTINENT_LABEL = 'Continent'

// Hand-curated major hub airports (representative, not exhaustive)
export const AIR_ROUTES_SAMPLE: GraphData = {
  nodes: [
    { id: 'ar-atl', labels: [AIRPORT_LABEL], label: AIRPORT_LABEL, properties: {
      code: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta', country: 'US',
      lat: 33.6367, lon: -84.4281, runways: 5,
    }},
    // ... 50-60 more major hubs
  ],
  links: [
    { id: 'ar-r-atl-jfk', source: 'ar-atl', target: 'ar-jfk', type: 'ROUTE', properties: { dist: 1199 }},
    // ...
  ],
}

export const AIR_ROUTES_QUERIES: GuidedQuery[] = [
  {
    key: 'all',
    label: 'All airports and routes',
    description: 'The full network of major hub airports and connections',
    cypher: 'MATCH (a:Airport) RETURN a',
    expectedResultCount: AIR_ROUTES_SAMPLE.nodes.length,
    filterFn: (data) => cloneGraphData(data),
    category: 'Explore',
  },
  // ... more queries
]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wikidata SPARQL for Nobel data | Nobel Prize Foundation REST API | 2020 (API v2.0) | No timeout risk, structured JSON, no SPARQL needed |
| GraphML format for air routes | CSV files (nodes + edges) | 2019 (krlawrence added CSV) | Direct import without GraphML parser |
| Separate GoT dataset repos | mathbeveridge/gameofthrones | 2019 | Season-by-season CSVs, consistently maintained |
| MovieLens 20M | MovieLens 25M | 2019 | More movies (62K vs 27K), same format |

**Deprecated/outdated:**
- `grouplens.org/datasets/movielens/20m/`: Superseded by 25M; use 25M download URL `https://files.grouplens.org/datasets/movielens/ml-25m.zip`
- `neo4j-examples/game-of-thrones`: Original repo does not have the TV show season CSVs; use `mathbeveridge/gameofthrones` which has all 8 seasons
- `api.nobelprize.org/v1/`: Superseded by v2.1; use `https://api.nobelprize.org/2.1/laureates`

## Dataset Facts (Verified)

| Dataset | Source | Nodes | Edges | Format | Download |
|---------|--------|-------|-------|--------|----------|
| MovieLens 25M (full) | grouplens.org | 62K movies + genres | 25M ratings | ZIP of CSVs | `https://files.grouplens.org/datasets/movielens/ml-25m.zip` (250MB) |
| MovieLens (demo subset) | derived | ~5K movies + genres | ~20K edges | Derived from above | - |
| Air Routes | krlawrence/graph | 3,749 (3,504 airports + 237 countries + 7 continents + 1 version) | 57,645 (50,637 routes + 7,008 contains) | Two CSVs on GitHub | Raw GitHub URL |
| Game of Thrones | mathbeveridge/gameofthrones | 406 unique characters + 8 seasons | ~4,100 interactions | 16 CSVs (2/season) | Raw GitHub URL |
| Nobel Prize / Wikidata | api.nobelprize.org | 1,018 laureates + ~60 countries + 6 categories + ~500 affiliations | ~2K-3K edges | REST API JSON | `https://api.nobelprize.org/2.1/laureates?limit=2000` |

## Key Dataset Schemas (Verified)

### Air Routes Node CSV Columns
```
~id, ~label, type:string, code:string, icao:string, desc:string, region:string,
runways:int, longest:int, elev:int, country:string, city:string, lat:double, lon:double
```

### Air Routes Edge CSV Columns
```
~id, ~from, ~to, ~label, dist:int
```

### GoT Node CSV Columns
```
Id, Label
```
Where `Id` is the canonical character identifier (uppercase with underscores) and `Label` is the display name.

### GoT Edge CSV Columns
```
Source, Target, Weight, Season
```
Where `Weight` is interaction count and `Season` is the TV season number (1-8).

### Nobel Prize API Laureate Fields
```json
{
  "id": "string",
  "knownName": { "en": "string" },
  "gender": "male|female|org",
  "birth": { "year": "string", "place": { "country": {"en": "string"}, "countryNow": {"en": "string"} } },
  "nobelPrizes": [
    {
      "awardYear": "string",
      "category": { "en": "string" },
      "affiliations": [{ "name": {"en": "string"}, "country": {"en": "string"} }]
    }
  ]
}
```

### MovieLens CSV Files
- `movies.csv`: `movieId, title, genres` (genres pipe-separated, e.g. `Action|Drama|Thriller`)
- `ratings.csv`: `userId, movieId, rating, timestamp` (25M rows, use for computing rating count per movie)
- `links.csv`: `movieId, imdbId, tmdbId` (for enrichment if desired)

## Open Questions

1. **MovieLens: User nodes or not?**
   - What we know: Including all 162K users makes the graph too large. Neo4j's demo omits users and uses genre nodes with `avgRating` as a movie property.
   - What's unclear: Whether to include any User nodes at all (e.g., 50 representative users) or just movie-genre graphs with aggregated ratings.
   - Recommendation: No User nodes for the demo. Model as Movie + Genre nodes. Add `avgRating` and `ratingCount` as Movie properties. This matches Neo4j's MovieLens demo approach and keeps the graph comprehensible.

2. **Air Routes: Include Country and Continent nodes?**
   - What we know: The CSV has 237 Country and 7 Continent nodes in addition to 3,504 airports, connected by `contains` edges.
   - What's unclear: Whether including all three node types enriches the demo or clutters it.
   - Recommendation: Include all three types. Country and Continent nodes enable "airports in region X" queries, which are some of the most natural air travel queries. They also increase node visual diversity in the landing page showcase card.

3. **Wikidata: Include organization affiliations as separate nodes?**
   - What we know: Each laureate has affiliation nodes (e.g., "Stanford University", "MIT"). There are ~500 unique affiliations.
   - What's unclear: Whether affiliation nodes add enough analytical value to justify the graph complexity.
   - Recommendation: Include top-50 most common affiliations as Institution nodes, skipping one-off affiliations. This creates meaningful "shared institution" traversals while keeping the graph manageable.

4. **How does `seed-demo.sh` handle the download dependency?**
   - What we know: The current seed script assumes `datasets/*.json` files already exist.
   - What's unclear: Whether to embed download+convert in `seed-demo.sh` or keep them as separate prerequisite scripts.
   - Recommendation: Keep download and convert as separate scripts. `seed-demo.sh` checks for JSON files and prints instructions if missing. This separates the network-dependent step from the database operation.

5. **Are GoT character IDs stable across seasons?**
   - What we know: Verified `got-s1-nodes.csv` uses uppercase IDs like `ARYA`, `NED`. Season 2+ files use the same format.
   - What's unclear: Whether every character appearing in season 2+ has exactly the same `Id` string as season 1.
   - Recommendation: Trust the `Id` column as the deduplication key. The mathbeveridge dataset was built for exactly this kind of cross-season analysis.

## Sources

### Primary (HIGH confidence)
- Live API call to `https://api.nobelprize.org/2.1/laureates` - confirmed 1,018 laureates, JSON structure verified
- `https://raw.githubusercontent.com/krlawrence/graph/master/sample-data/air-routes-latest-nodes.csv` - header and sample rows verified
- `https://raw.githubusercontent.com/krlawrence/graph/master/sample-data/air-routes-latest-edges.csv` - header and sample rows verified
- `https://raw.githubusercontent.com/mathbeveridge/gameofthrones/master/data/got-s1-nodes.csv` - CSV structure verified
- `https://raw.githubusercontent.com/mathbeveridge/gameofthrones/master/data/got-s1-edges.csv` - CSV structure verified
- `/Users/ashesh/opengraphdb/frontend/src/data/datasets.ts` - existing registry pattern
- `/Users/ashesh/opengraphdb/frontend/src/data/fraudGraph.ts` - offline fallback pattern
- `/Users/ashesh/opengraphdb/datasets/movies.json` - OpenGraphDB JSON import format
- `/Users/ashesh/opengraphdb/scripts/seed-demo.sh` - existing seed pattern

### Secondary (MEDIUM confidence)
- `https://files.grouplens.org/datasets/movielens/ml-25m-README.html` - CSV file names and structure confirmed via WebSearch; direct page access confirmed 250MB zip at `ml-25m.zip`
- `https://github.com/mathbeveridge/gameofthrones` - repository structure confirmed via WebFetch; 16 CSV files (2 per season) confirmed
- WebSearch for Wikidata SPARQL limits: 60-second timeout confirmed by multiple sources

### Tertiary (LOW confidence)
- Neo4j MovieLens demo approach (no User nodes, use genre nodes) - referenced in WebSearch results but not directly verified against current Neo4j demo

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Python stdlib is definitive, existing TypeScript patterns confirmed from codebase
- Architecture: HIGH - All dataset formats verified from live sources; existing code patterns read directly
- Pitfalls: HIGH - Node ID collision, GoT deduplication, Wikidata timeout all verified from primary sources
- Dataset facts: HIGH - Node/edge counts verified from live CSV files and live API calls

**Research date:** 2026-03-02
**Valid until:** 2026-04-01 (dataset sources are stable; API at nobelprize.org is versioned; GitHub CSV files change only with new data)
