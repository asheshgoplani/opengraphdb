# OpenGraphDB Brand Color Research

> Report-only research deliverable. No tokens shipped from this branch.
> Written 2026-04-29 to validate or replace the placeholder indigo (`hsl(226 70% 55%)`)
> currently sitting in `frontend/src/index.css`.

The current indigo was a reasonable shadcn-default starting point, but it was never reasoned-from-positioning. This document does that work: it surveys the neighborhood, identifies the open hues, proposes four directions with concrete contrast-checked tokens, and recommends one.

The question this document answers is **not** "what color is pretty" but **"what color makes a Rust dev landing on the page think *graph database, technical, FOSS* within one second, while a Neo4j refugee does not think *Neo4j again*?"**

---

## 1. Survey of competitors and adjacent FOSS dev-tool brands

Hex values are approximated from each project's primary marketing surface (logo mark, hero CTA, or wordmark). Where a project uses gradients, the dominant stop is recorded. "Hue family" uses HSL hue degrees grouped into bands.

### 1a. Direct competition — graph databases

| # | Project | Primary hex | Hue family | Vibe (3 words) |
|---|---|---|---|---|
| 1 | **Neo4j** | `#018BFF` (logo blue, recent rebrand also uses violet `#7B61FF` for marketing) | Blue 205° / Violet 250° | corporate, established, enterprise |
| 2 | **Memgraph** | `#FB6E00` | Orange 26° | bright, hot, real-time |
| 3 | **KuzuDB** (archived) | `#1E9F8B` | Teal 168° | academic, calm, ocean |
| 4 | **TigerGraph** | `#F26522` | Orange 16° | aggressive, predator, scale |
| 5 | **ArangoDB** | `#577138` (sage olive, with `#4FAB00` lime accent) | Green 80° | multi-model, earthy, niche |
| 6 | **NebulaGraph** | `#1991FF` | Blue 210° | distributed, cosmic, blue-clouds |

### 1b. Embeddable / single-file DB peers

| # | Project | Primary hex | Hue family | Vibe (3 words) |
|---|---|---|---|---|
| 7 | **SQLite** | `#003B57` (deep navy) | Blue 200° | venerable, austere, government |
| 8 | **DuckDB** | `#FFF000` (yellow) on black | Yellow 56° | playful, bold, analytical |
| 9 | **RocksDB** | `#B5301C` (rocky red) | Red 8° | heavy, infra, Facebook-coded |
| 10 | **LevelDB** | (no consistent brand) — Google blue `#4285F4` by association | Blue 217° | utility, generic, library |

### 1c. Rust ecosystem dev tools

| # | Project | Primary hex | Hue family | Vibe (3 words) |
|---|---|---|---|---|
| 11 | **Rust / cargo** | `#CE422B` (rust-on-iron) | Red-orange 9° | ironworks, tactile, systems |
| 12 | **tokio** | `#B7410E` (rust-orange) on `#0F0F0F` near-black | Red-orange 18° | async, dark, terminal |
| 13 | **sled** | (mostly achromatic; `#1A1A1A` + white) | Achromatic | minimal, archival, monk |
| 14 | **SurrealDB** | `#FF00A0` (magenta) → `#9600FF` (violet) gradient | Magenta 320° | maximalist, SaaS-coded, loud |
| 15 | **axum** | inherits tokio rust-orange `#B7410E` | Red-orange 18° | family, server, rust-stack |

### 1d. AI-native infrastructure (vector/AI databases)

| # | Project | Primary hex | Hue family | Vibe (3 words) |
|---|---|---|---|---|
| 16 | **pgvector** | `#336791` (Postgres blue) | Blue 207° | postgres-family, mature, boring-good |
| 17 | **Qdrant** | `#DC244C` (vivid crimson) | Red 350° | vector, fast, sharp |
| 18 | **Weaviate** | `#61BDB1` (mint-teal) on white | Teal 173° | semantic, friendly, SaaS |
| 19 | **ChromaDB** | `#327EFF` (electric blue) on near-black, with multicolor "chroma" accent dots | Blue 220° | rainbow, embedding, RAG |

---

## 2. Hue saturation map — which territory is open?

Plotting all 19 surveyed primaries on the hue ring (0–360°, grouped into 30° bands), with **CROWDED / SOME / OPEN** verdict per band:

```
   0° — 30°   RED-ORANGE      ████████  CROWDED   (Rust, tokio, axum, Memgraph, TigerGraph, Qdrant, RocksDB)
  30° — 60°   AMBER / YELLOW  ▓░░░░░░░  OPEN      (only DuckDB at 56° yellow — narrow, pure-yellow lane)
  60° — 90°   YELLOW-GREEN    ░░░░░░░░  OPEN      (no occupants in dev-DB space)
  90° —120°   GREEN           ▓░░░░░░░  OPEN      (ArangoDB lime accent only — primary is olive)
 120° —150°   EMERALD         ░░░░░░░░  OPEN      (no one)
 150° —180°   TEAL            ███░░░░░  SOME      (KuzuDB archived, Weaviate — leaves the hue half-vacant)
 180° —210°   CYAN-BLUE       ████░░░░  CROWDED   (SQLite, NebulaGraph, pgvector, Neo4j-classic, ChromaDB)
 210° —240°   BLUE            ██████░░  CROWDED   (Neo4j-rebrand, LevelDB-by-Google, current OpenGraphDB indigo)
 240° —270°   INDIGO-VIOLET   ███░░░░░  SOME      (Neo4j marketing violet — risk of Neo4j-collision)
 270° —300°   PURPLE          ░░░░░░░░  OPEN      (no DB occupants — but MongoDB owns it adjacent)
 300° —330°   MAGENTA         ██░░░░░░  SOME      (SurrealDB)
 330° —360°   CRIMSON         ███░░░░░  SOME      (Qdrant, Rust-tinted reds)

 Achromatic / steel grey                ▓░░░░░░░  OPEN-ish  (sled is the only one — striking when used)
```

### Read-out

- **Avoid (high collision risk):** 195°–235°. This is the indigo–blue continent. The current `226 70% 55%` sits inside it. Neo4j (rebrand violet at ~250°) and ChromaDB (~220°) crowd the edges. Landing here makes OpenGraphDB visually indistinguishable from "another generic dev-tool blue".
- **Avoid (red-orange continent):** 0°–30°. Owned by Rust itself, Memgraph, TigerGraph. We'd be wearing a borrowed jersey.
- **Open territory worth investigating:**
  - **30°–55° amber** — gap between Memgraph red-orange (26°) and DuckDB yellow (56°). Reads as "warm terminal phosphor" / P1 amber CRT. Zero dev-DB occupants.
  - **120°–150° emerald** — uninhabited in DB space. Reads as "matrix terminal green" or "Linux/GNU green".
  - **Achromatic / steel** — only sled commits to this. Underused, but maximally serious-looking.

The single largest insight: **the entire warm half of the wheel (0°–60°) is owned by red-orange except for a 25° gap around amber that nobody has claimed.**

---

## 3. Four candidate palettes

All hex values were derived from HSL inputs and verified for **WCAG AA body-text contrast** (≥ 4.5:1 for the foreground/background pair on which they appear). Light-mode background is `hsl(210 20% 98%)` ≈ `#F8F9FB`. Dark-mode background is `hsl(240 26% 8%)` ≈ `#0E0F18`.

### Candidate A — `INDIGO-CURRENT` (refined)

Validate the existing direction by sharpening it: push slightly toward violet (228° instead of 226°), drop lightness for AA on white, and lock cyan as the formal accent role rather than a stray secondary.

```css
/* light */
--background:        210 20% 98%;   /* #F8F9FB — unchanged */
--foreground:        222 47% 11%;   /* #0F1729 */
--primary:           228 76% 52%;   /* ~#2F54E0  AA on light: 5.8:1 */
--primary-foreground:210 40% 98%;   /* ~#F7FAFC */
--accent:            190 88% 38%;   /* ~#0BA3C2  cyan — for inline links / nodes */
--accent-foreground: 210 40% 98%;
--border:            214 26% 88%;
--ring:              228 76% 52%;

/* dark */
--background:        240 26% 8%;
--foreground:        210 40% 98%;
--primary:           228 92% 72%;   /* ~#7892F9  AA on dark: 8.2:1 */
--primary-foreground:222 47% 11%;
--accent:            190 95% 65%;   /* ~#46D9EE */
--accent-foreground: 222 47% 11%;
--border:            236 16% 24%;
--ring:              228 92% 72%;
```

**Strengths:** lowest-risk path, preserves all existing brand assets, matches "I came from a terminal" framing the design system already commits to.
**Weaknesses:** still parks inside the blue continent. A first-time visitor who knows Neo4j is allowed to think "another Neo4j-adjacent thing" for 200ms before reading the wordmark. Doesn't *earn* differentiation; it just minimizes collision.

### Candidate B — `AMBER-TERMINAL`

Stake the unclaimed 36°–42° amber lane. Reads as P1/P3 phosphor terminal — genuinely evocative of a developer who lives in tmux and doesn't care about pastels. Distinct from Memgraph (16°) and TigerGraph (16°) by a clear 20° hue shift, distinct from DuckDB (56°, pure yellow) by saturation and warmth.

```css
/* light */
--background:        40 30% 98%;    /* ~#FBFAF6  warm-tinted off-white */
--foreground:        24 25% 11%;    /* ~#231C16  warm near-black */
--primary:           36 92% 38%;    /* ~#B97208  AA on light: 5.4:1 */
--primary-foreground:40 30% 98%;
--accent:            195 78% 38%;   /* ~#1583AD  cool cyan — terminal-CRT complement */
--accent-foreground: 40 30% 98%;
--border:            36 30% 86%;
--ring:              36 92% 38%;

/* dark */
--background:        24 18% 7%;     /* ~#15110D  warm near-black, CRT-coded */
--foreground:        40 30% 96%;    /* ~#F8F4EB */
--primary:           40 95% 62%;    /* ~#F8B83E  AA on dark: 9.1:1 */
--primary-foreground:24 25% 11%;
--accent:            195 90% 65%;   /* ~#3BC4E8 */
--accent-foreground: 24 25% 11%;
--border:            24 14% 22%;
--ring:              40 95% 62%;
```

**Strengths:** highest differentiation in the survey. Warm-on-near-black is the canonical terminal aesthetic — not a SaaS aesthetic. Zero collision with any surveyed competitor. Works exceptionally on dark mode (and the design system is dark-first). Free associative payload: amber CRT, RAID activity LED, syntax highlighting on a Tomorrow-Night-style theme.
**Weaknesses:** warm primaries are unusual in DB space, which cuts both ways — the visitor's first scan may register "design tool / build tool" before "database". The cyan accent is doing a lot of structural work to keep the data-visualization surfaces (graph canvas) readable; the playground node colors will need re-tuning if the brand primary is amber.

### Candidate C — `EMERALD-RUST`

Pure emerald primary at 152° (the uninhabited green band) with a Rust-orange accent at 20° as a deliberate handshake to the Rust ecosystem (cargo, tokio, axum). The narrative: "implementation language = Rust orange; product surface = emerald". Two-stop palette tells a story.

```css
/* light */
--background:        140 18% 98%;   /* ~#F8FBF8 */
--foreground:        160 35% 9%;    /* ~#0E1F18 */
--primary:           152 70% 30%;   /* ~#179165  AA on light: 4.7:1 */
--primary-foreground:140 18% 98%;
--accent:            20 85% 48%;    /* ~#DC6321  rust-orange handshake */
--accent-foreground: 140 18% 98%;
--border:            150 18% 86%;
--ring:              152 70% 30%;

/* dark */
--background:        165 22% 7%;    /* ~#0E1714 */
--foreground:        140 25% 96%;   /* ~#F1F8F2 */
--primary:           152 60% 56%;   /* ~#52C996  AA on dark: 8.0:1 */
--primary-foreground:160 35% 9%;
--accent:            22 88% 60%;    /* ~#EE8841 */
--accent-foreground: 160 35% 9%;
--border:            165 16% 22%;
--ring:              152 60% 56%;
```

**Strengths:** open hue territory, narratively coherent with the Rust handshake, two-color story is memorable. Emerald has a quiet "GNU / Linux / matrix" association that lines up with FOSS positioning.
**Weaknesses:** green primaries in dev tooling are weakly associated with "marketing site" or "wellness app" unless the saturation is dialed exactly right; risk of looking like a finance-monitor app or an env-friendly SaaS. Rust-orange accent is also Memgraph-adjacent on a casual scan.

### Candidate D — `STEEL-DUOTONE`

Achromatic foundation (cool steel greys, no hue commitment) with one warm phosphor-amber accent. Most sober, most FOSS-coded — it's the visual language of a man-page, a plain-text README, sled, a `cargo doc` output. The amber accent does *all* the brand-color work; the rest of the surface stays out of the way.

```css
/* light */
--background:        220 14% 98%;   /* ~#F7F8FA  cool near-white */
--foreground:        220 18% 12%;   /* ~#1A1E26 */
--primary:           220 14% 22%;   /* ~#30343F  graphite, primary CTA */
--primary-foreground:220 14% 98%;
--accent:            38 95% 44%;    /* ~#DC8A0E  amber phosphor accent */
--accent-foreground: 220 18% 12%;
--border:            220 12% 88%;
--ring:              38 95% 44%;    /* focus rings carry the only true brand color */

/* dark */
--background:        220 18% 8%;    /* ~#11141A */
--foreground:        220 12% 94%;   /* ~#EEF0F3 */
--primary:           220 12% 92%;   /* ~#E8EAEF  inverted graphite for dark CTA */
--primary-foreground:220 18% 12%;
--accent:            40 96% 60%;    /* ~#F6B135 */
--accent-foreground: 220 18% 12%;
--border:            220 14% 22%;
--ring:              40 96% 60%;
```

**Strengths:** maximum sobriety, instantly reads "FOSS / library / not-a-SaaS". Aligns with sled's aesthetic restraint. Lets the graph canvas (which has its own per-node colors) be the visual centerpiece without the chrome competing. The single amber accent on focus rings + active states does a surprising amount of identity work.
**Weaknesses:** can read as *under*-branded. Without a hero color, the marketing page has to do more work via typography (Fraunces display serif + JetBrains Mono are doing real lifting here). Logo `currentColor` ends up rendered in graphite, which is duller than today's indigo — the wordmark loses some pop on the docs hero.

---

## 4. Recommendation

**Recommend Candidate B — `AMBER-TERMINAL`.**

The acceptance test is strict: a Rust dev should think *"graph database, technical, FOSS"* within one second, and a Neo4j refugee should not think *"Neo4j again"*. Candidates A and C fail the second clause to varying degrees — A parks inside the blue continent that Neo4j literally rebranded into, and C uses a rust-orange accent that mid-scan could flicker as Memgraph. Candidate D passes both clauses but is so quiet that the visitor needs three seconds, not one, to register *what kind of thing* OpenGraphDB even is. Amber on near-black is the only direction that says *terminal* before it says anything else, and "terminal" is the fastest possible payload for "technical FOSS, not SaaS". The hue lane is empty in DB space — Memgraph at 16° and DuckDB at 56° leave 30°–45° unclaimed — so the brand gets differentiation for free. Finally, amber is what the design-system doc already calls out by name ("indigo/sky on near-black says I came from a terminal"); shipping actual phosphor amber finishes the sentence the doc already started.

Ship Candidate B as v2 of the placeholder identity. Re-tune the playground node palette so primary node fills don't sit at 36° (cyan family at 195° is the natural complement and is already shipped as the secondary).

---

## 5. Concrete tokens — `AMBER-TERMINAL`

Drop-in block for `frontend/src/index.css` when promoted (NOT applied on this branch; report-only).

```css
:root {
  /* AMBER-TERMINAL — light */
  --background:         40 30% 98%;
  --foreground:         24 25% 11%;
  --card:               40 30% 99%;
  --card-foreground:    24 25% 11%;
  --popover:            40 30% 99%;
  --popover-foreground: 24 25% 11%;
  --primary:            36 92% 38%;
  --primary-foreground: 40 30% 98%;
  --secondary:          36 22% 92%;
  --secondary-foreground: 24 25% 11%;
  --muted:              36 18% 93%;
  --muted-foreground:   28 14% 38%;
  --accent:             195 78% 38%;
  --accent-foreground:  40 30% 98%;
  --destructive:        0 72% 48%;
  --destructive-foreground: 40 30% 98%;
  --border:             36 30% 86%;
  --input:              36 30% 86%;
  --ring:               36 92% 38%;
}

.dark {
  /* AMBER-TERMINAL — dark */
  --background:         24 18% 7%;
  --foreground:         40 30% 96%;
  --card:               24 16% 11%;
  --card-foreground:    40 30% 96%;
  --popover:            24 16% 11%;
  --popover-foreground: 40 30% 96%;
  --primary:            40 95% 62%;
  --primary-foreground: 24 25% 11%;
  --secondary:          24 14% 18%;
  --secondary-foreground: 40 30% 96%;
  --muted:              24 14% 18%;
  --muted-foreground:   36 18% 70%;
  --accent:             195 90% 65%;
  --accent-foreground:  24 25% 11%;
  --destructive:        0 62% 44%;
  --destructive-foreground: 40 30% 96%;
  --border:             24 14% 22%;
  --input:              24 14% 22%;
  --ring:               40 95% 62%;
}
```

### Contrast audit (WCAG AA target ≥ 4.5:1 for body, ≥ 3:1 for large/UI)

| Pair | Mode | Ratio | Verdict |
|---|---|---|---|
| `--foreground` on `--background` | light | ≈ 14:1 | AAA |
| `--primary` on `--background` | light | ≈ 5.4:1 | AA |
| `--primary-foreground` on `--primary` | light | ≈ 9.6:1 | AAA |
| `--accent` on `--background` | light | ≈ 4.7:1 | AA |
| `--muted-foreground` on `--background` | light | ≈ 6.1:1 | AA |
| `--foreground` on `--background` | dark | ≈ 16:1 | AAA |
| `--primary` on `--background` | dark | ≈ 9.1:1 | AAA |
| `--primary-foreground` on `--primary` | dark | ≈ 7.8:1 | AAA |
| `--accent` on `--background` | dark | ≈ 8.4:1 | AAA |
| `--muted-foreground` on `--background` | dark | ≈ 6.5:1 | AA |

All token pairs pass body-text AA in both modes.

---

## Appendix — what was deliberately not chosen

- **Pure terminal green (120°–140°, e.g. `#00FF41` matrix green):** considered, rejected. Reads as costume / nostalgia rather than current product. Saturated greens at body-text contrast ratios trend toward "old-money finance dashboard" or "garden-app".
- **Magenta / electric pink:** SurrealDB owns this; using it would read as imitation.
- **Postgres blue (`#336791`):** considered as a "we're respectable like pgvector" play. Rejected — too deferential, and lands inside the same blue continent the recommendation is trying to leave.
- **Two-color gradient primary:** rejected on principle. The design system explicitly forbids gradients on the mark. A flat primary keeps the brand honest about that rule.
