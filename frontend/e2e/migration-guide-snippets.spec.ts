// RED-phase failing test for `documentation/MIGRATION-FROM-NEO4J.md`. Mirrors the
// bring-up pattern from `frontend/e2e/cookbook-snippets-runnable.spec.ts`:
// spawns a release `ogdb` against a fresh tmp `.ogdb`, healthchecks, runs
// every Cypher snippet from Section 7 against the live HTTP `/query` route,
// and shape-asserts the prose for the other six sections.
//
// Until `documentation/MIGRATION-FROM-NEO4J.md` lands, the doc-existence assertions
// fail and the per-section content checks short-circuit on the missing file.
// After Phase 8 of `.planning/neo4j-migration-guide/PLAN.md` ships, every
// test passes.
//
// Per-spec runner:
//   cd frontend && npx playwright test e2e/migration-guide-snippets.spec.ts

import { expect, test } from '@playwright/test'
import { spawn, spawnSync } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const REPO_ROOT = join(process.cwd(), '..')
const OGDB_BIN = join(REPO_ROOT, 'target', 'release', 'ogdb')
const GUIDE_PATH = join(REPO_ROOT, 'documentation', 'MIGRATION-FROM-NEO4J.md')
const BENCHMARKS_PATH = join(REPO_ROOT, 'documentation', 'BENCHMARKS.md')

// Distinct port from the cookbook spec (8181) so the two specs can run
// concurrently without colliding on bind.
const SERVE_PORT = 8182
const HEALTH_URL = `http://127.0.0.1:${SERVE_PORT}/health`
const BASE_URL = `http://127.0.0.1:${SERVE_PORT}`

const SKIP =
  process.env.CI === 'true' &&
  !existsSync(OGDB_BIN) &&
  process.env.OGDB_E2E_LIVE !== '1'

let serveProc: ChildProcessWithoutNullStreams | null = null
let serveDir: string | null = null
let serveDbPath: string | null = null

function ensureReleaseBinary(): void {
  if (existsSync(OGDB_BIN)) {
    try {
      chmodSync(OGDB_BIN, 0o755)
    } catch {
      /* best effort */
    }
    return
  }
  const build = spawnSync('cargo', ['build', '--release', '-p', 'ogdb-cli'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
  if (build.status !== 0) {
    throw new Error(`cargo build --release -p ogdb-cli failed with status ${build.status}`)
  }
  if (!existsSync(OGDB_BIN)) {
    throw new Error(`expected release binary at ${OGDB_BIN} after build — not found`)
  }
}

async function waitForHealthy(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(HEALTH_URL)
      if (resp.status === 200) {
        const body = (await resp.json()) as { status?: string }
        if (body.status === 'ok') return
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `ogdb serve --http did not become healthy within ${timeoutMs}ms (last err: ${String(lastErr)})`,
  )
}

function readGuide(): string {
  if (!existsSync(GUIDE_PATH)) {
    throw new Error(`documentation/MIGRATION-FROM-NEO4J.md does not exist at ${GUIDE_PATH}`)
  }
  return readFileSync(GUIDE_PATH, 'utf-8')
}

function readBenchmarks(): string {
  if (!existsSync(BENCHMARKS_PATH)) {
    throw new Error(`documentation/BENCHMARKS.md does not exist at ${BENCHMARKS_PATH}`)
  }
  return readFileSync(BENCHMARKS_PATH, 'utf-8')
}

// Pull the bolded headline value for a numbered row out of BENCHMARKS.md's
// competitive-comparison table. The table schema is
// `| # | Metric | OpenGraphDB | Neo4j | Memgraph | Kuzu | best-in-class | Verdict |`,
// so after splitting the line on `|` and stripping the empty boundary cells,
// `cells[2]` is the OGDB headline cell — matching the convention documented
// in `scripts/check-benchmarks-cell-internal-consistency.sh`. We must
// extract the bold token from that cell specifically: a row-global match
// would silently return any `**...**` annotation that landed in an earlier
// column (e.g. row 3's `**cold**` emphasis in the metric-name cell), and
// per-token substring assertions like `expect(body).toContain('cold')`
// would then trivially pass on nonsense — the cycle-33 HIGH-1 finding.
// Sourcing the value at test time means re-baselines (cycle-19 → cycle-31
// → cycle-33 …) flow through to this spec without manual selector updates.
function parseBenchmarksHeadline(rowNum: number, source?: string): string {
  const text = source ?? readBenchmarks()
  const lines = text.split('\n')
  const prefix = `| ${rowNum} |`
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length < 3) continue
    const ogdb = cells[2]
    const match = ogdb.match(/\*\*([^*]+)\*\*/)
    if (match) return match[1].trim()
  }
  throw new Error(`could not find competitive headline for BENCHMARKS.md row ${rowNum}`)
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let json: unknown = null
  try {
    json = await resp.json()
  } catch {
    json = null
  }
  return { status: resp.status, json }
}

// Unit tests for parseBenchmarksHeadline. Kept in a separate describe block
// so they run without spawning the live `ogdb serve` process. Locks the
// cycle-33 HIGH-1 fix: row 3 must return the OGDB headline (`5.8 / 6.8 /
// 11.8 μs`), NOT the `**cold**` bold token from the metric-name cell.
test.describe('migration-from-neo4j parser — parseBenchmarksHeadline unit', () => {
  test('row 1 returns OGDB headline `251 nodes/s`', () => {
    expect(parseBenchmarksHeadline(1)).toBe('251 nodes/s')
  })

  test('row 3 returns OGDB headline `5.8 / 6.8 / 11.8 μs` (NOT `cold` from metric-cell annotation)', () => {
    const result = parseBenchmarksHeadline(3)
    expect(result).toBe('5.8 / 6.8 / 11.8 μs')
    expect(result).not.toBe('cold')
  })

  test('row 7 returns OGDB headline `38.8 / 46.7 / 112.6 ms`', () => {
    expect(parseBenchmarksHeadline(7)).toBe('38.8 / 46.7 / 112.6 ms')
  })
})

test.describe('migration-from-neo4j guide — runnable + honesty-asserted', () => {
  test.skip(SKIP, 'release binary missing in CI; set OGDB_E2E_LIVE=1 to force')

  test.beforeAll(async () => {
    ensureReleaseBinary()

    serveDir = mkdtempSync(join(tmpdir(), 'migration-e2e-'))
    serveDbPath = join(serveDir, 'migration.ogdb')

    serveProc = spawn(
      OGDB_BIN,
      ['serve', '--http', '--port', String(SERVE_PORT), serveDbPath],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const earlyExit = new Promise<never>((_, reject) => {
      serveProc!.once('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`ogdb serve exited before healthy (code=${code}, signal=${signal})`))
      })
    })

    await Promise.race([waitForHealthy(15_000), earlyExit])
  })

  test.afterAll(async () => {
    if (serveProc && !serveProc.killed) {
      serveProc.kill('SIGTERM')
      await new Promise((r) => setTimeout(r, 300))
      if (!serveProc.killed) serveProc.kill('SIGKILL')
    }
    serveProc = null
    if (serveDir) {
      try {
        rmSync(serveDir, { recursive: true, force: true })
      } catch {
        /* best effort */
      }
    }
    serveDir = null
    serveDbPath = null
  })

  // -------------------------------------------------------------------------
  // Test 1 — doc exists with all 7 section headings (PLAN Section B locks the
  // wording). RED until Phase 2 ships the scaffold.
  // -------------------------------------------------------------------------
  test('migration guide doc exists with all 7 section headings', () => {
    const body = readGuide()
    const requiredHeadings = [
      'License and deployment',
      'Cypher coverage delta',
      'Bolt protocol compatibility',
      'AI-native primitives',
      'Performance characteristics',
      'What to know before migrating',
      'Working examples',
    ]
    for (const heading of requiredHeadings) {
      expect(body, `migration guide must contain section heading "${heading}"`).toContain(heading)
    }
  })

  // -------------------------------------------------------------------------
  // Test 2 — live backend gate. Confirms ogdb serve --http is healthy before
  // the per-section content tests below run.
  // -------------------------------------------------------------------------
  test('setup gate: GET /health returns ok', async () => {
    readGuide()
    const resp = await fetch(HEALTH_URL)
    expect(resp.status).toBe(200)
    const json = (await resp.json()) as { status?: string }
    expect(json.status).toBe('ok')
  })

  // -------------------------------------------------------------------------
  // Section 1 — License and deployment.
  // -------------------------------------------------------------------------
  test('section 1 (license + deployment) names Apache 2.0 vs AGPL and single-file deployment', () => {
    const body = readGuide()
    expect(body).toContain('Apache 2.0')
    expect(body).toContain('AGPL')
    // Either spelling is acceptable — the README uses "single-file" and
    // SPEC uses "single binary"; the guide is free to pick either.
    const hasSingleFile = body.includes('single-file') || body.includes('single binary')
    expect(hasSingleFile, 'guide must name the single-file/single-binary deployment').toBe(true)
  })

  // -------------------------------------------------------------------------
  // Section 2 — Cypher coverage delta. Honest TCK framing required: the
  // "not yet published" marker fails fast if a future edit invents a number.
  // -------------------------------------------------------------------------
  test('section 2 (cypher coverage) cites TCK harness and avoids inventing a pass-rate number', () => {
    const body = readGuide()
    expect(body).toContain('TCK')
    expect(body).toContain('Tier-1')
    expect(body).toContain('ogdb-tck')
    // Honesty marker — see PLAN Section A "non-goals" and Section E "honesty
    // audit". If a future edit replaces the harness command with an invented
    // pass-rate number, this test fails — by design.
    expect(
      body,
      'cypher-delta section must say "not yet published" instead of inventing a TCK pass rate',
    ).toContain('not yet published')
  })

  // -------------------------------------------------------------------------
  // Section 3 — Bolt protocol compatibility. Honest framing: v1 only, modern
  // drivers will not silently fall back. The "Bolt v3+" caveat string is the
  // honesty marker for this section.
  // -------------------------------------------------------------------------
  test('section 3 (bolt compat) names v1 only with the v3+ caveat', () => {
    const body = readGuide()
    expect(body).toContain('Bolt v1')
    expect(body).toContain('0x6060')
    // Honesty marker — guards against future edits that quietly drop the
    // "v3+ features are not implemented" caveat and let drop-in-driver
    // hopes inflate.
    expect(body).toContain('Bolt v3+')
  })

  // -------------------------------------------------------------------------
  // Section 4 — AI-native primitives. The link to COOKBOOK.md Recipe 2 is the
  // canonical pointer for the "vector + graph + text in one query" claim.
  // -------------------------------------------------------------------------
  test('section 4 (AI-native) names the in-core MCP tool surface and links to COOKBOOK Recipe 2', () => {
    const body = readGuide()
    expect(body).toContain('vector_search')
    expect(body).toContain('text_search')
    expect(body).toContain('rag_retrieve')
    expect(body).toContain('MCP')
    // Relative link to the cookbook (sibling under docs/).
    expect(body).toContain('COOKBOOK.md')
  })

  // -------------------------------------------------------------------------
  // Section 5 — Performance. Cite BENCHMARKS row numbers verbatim. No hype.
  // The "scale-mismatch" string is the honesty marker for the rows that
  // BENCHMARKS already labels as scale-mismatched (rows 3, 4, 5, 11, 12).
  // -------------------------------------------------------------------------
  test('section 5 (performance) cites BENCHMARKS rows verbatim and labels scale-mismatched rows', () => {
    const body = readGuide()
    // Source the canonical headline values for Row 1 (loss: bulk ingest)
    // and Row 7 (win: enrichment p50/p95/p99) from BENCHMARKS.md at test
    // time so that future re-baselines do not require updating this spec.
    // The guide must quote each row's bolded headline tokens verbatim.
    // Multi-value headlines like `38.8 / 46.7 / 112.6 ms` split on ` / `
    // (spaces around the slash); single-value headlines like `251 nodes/s`
    // stay intact because the unit slash has no surrounding spaces.
    // Row 3's tokens (5.8 / 6.8 / 11.8 μs) are not yet cited verbatim in
    // § 5 of the migration guide — the section narrates row 3 via the
    // "directional indicator" prose, not the headline triple. The
    // parser-unit describe block above locks `parseBenchmarksHeadline(3)`
    // independently, so the row-3 fix from cycle-33 HIGH-1 is fully
    // exercised even with the guide-quote loop limited to [1, 7].
    for (const rowNum of [1, 7]) {
      const headline = parseBenchmarksHeadline(rowNum)
      const tokens = headline
        .split(/\s+\/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
      for (const token of tokens) {
        expect(
          body,
          `migration guide must quote BENCHMARKS row ${rowNum} headline token "${token}" verbatim (sourced from BENCHMARKS.md at test time)`,
        ).toContain(token)
      }
    }
    // Cross-link to the source of truth.
    expect(body).toContain('BENCHMARKS.md')
    // Honesty marker — either spelling acceptable, case-insensitive (post
    // cycle-18 F02 the honesty footer promotes "Scale-mismatched" to a bold
    // sub-heading, capitalising the S; the prior prose form was lowercase).
    const lowerBody = body.toLowerCase()
    const hasScaleMismatch =
      lowerBody.includes('scale-mismatch') ||
      lowerBody.includes('scale mismatch') ||
      lowerBody.includes('scale-mismatched')
    expect(hasScaleMismatch, 'performance section must label scale-mismatched rows').toBe(true)
  })

  // -------------------------------------------------------------------------
  // Section 6 — What to know before migrating. Three rewrites: LABEL → labels,
  // id() → row payload, BTREE-syntax → ogdb's pre-4.x `CREATE INDEX ON` form.
  // -------------------------------------------------------------------------
  test('section 6 (what to know) names the LABEL/id()/INDEX rewrites', () => {
    const body = readGuide()
    expect(body).toContain('labels')
    // `id(` matches both id(n) and id() function references.
    expect(body).toContain('id(')
    expect(body).toContain('CREATE INDEX ON')
  })

  // -------------------------------------------------------------------------
  // Section 7 — Working examples (runnable). Test 9 + Test 10 confirm the
  // two Cypher snippets the guide promises are runnable actually run.
  // -------------------------------------------------------------------------
  test('section 7 working example: POST /query with the identical Cypher returns 200', async () => {
    // Lifted verbatim from the doc (PLAN Section B, Section 7's
    // first Cypher snippet). If the doc renames it, this assertion fails
    // until the doc and the spec line up again.
    const guide = readGuide()
    const identicalCypher = 'MATCH (n) RETURN count(n) AS c'
    expect(
      guide,
      `Section 7 must include the identical-on-both example "${identicalCypher}"`,
    ).toContain(identicalCypher)

    const { status, json } = await postJson('/query', { query: identicalCypher })
    expect(status).toBe(200)
    // The result must include a numeric count cell (>= 0). On an empty DB it
    // is 0; on a populated DB it is positive. Both are valid — assert any
    // non-negative integer is present.
    const stringified = JSON.stringify(json)
    expect(stringified).toMatch(/\b[0-9]+\b/)
  })

  test('section 7 working example: POST /query with the translated index DDL returns 200', async () => {
    // Lifted verbatim from the migration translation table (PLAN Section B,
    // Section 7, row 1). This is the single concrete proof that "Neo4j
    // 4.x+ CREATE INDEX FOR (n:Person) ON (n.email)" maps to ogdb's
    // pre-4.x form `CREATE INDEX ON :Person(email)`. Confirmed runnable
    // by the existing unit test at crates/ogdb-cli/src/lib.rs:9951.
    const guide = readGuide()
    const translatedCypher = 'CREATE INDEX ON :Person(email)'
    expect(
      guide,
      `Section 7 translation table must include "${translatedCypher}" as the ogdb form`,
    ).toContain(translatedCypher)

    const { status, json } = await postJson('/query', { query: translatedCypher })
    // 200 = OK; the query path returns success even if the result set is empty.
    expect(status).toBe(200)
    // Must NOT be an `{ error: ... }` body — the translation row is real,
    // not aspirational.
    const stringified = JSON.stringify(json ?? {})
    expect(
      stringified.toLowerCase().includes('"error"'),
      'translated index DDL must succeed, not error',
    ).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Test 11 — every relative link in the doc resolves to an in-repo file.
  // Catches the most likely silent-rot mode (a renamed crate or moved doc).
  // -------------------------------------------------------------------------
  test('cross-links resolve to in-repo files', () => {
    const body = readGuide()

    // The set of relative links the guide promises in its "See also" footer
    // and inline citations. PLAN Section B + Section C list these exactly.
    const requiredTargets: { href: string; abs: string }[] = [
      { href: 'LICENSE', abs: join(REPO_ROOT, 'LICENSE') },
      { href: 'documentation/COOKBOOK.md', abs: join(REPO_ROOT, 'documentation', 'COOKBOOK.md') },
      { href: 'documentation/BENCHMARKS.md', abs: join(REPO_ROOT, 'documentation', 'BENCHMARKS.md') },
      {
        href: 'crates/ogdb-tck/README.md',
        abs: join(REPO_ROOT, 'crates', 'ogdb-tck', 'README.md'),
      },
      { href: 'README.md', abs: join(REPO_ROOT, 'README.md') },
      {
        href: 'skills/schema-advisor/SKILL.md',
        abs: join(REPO_ROOT, 'skills', 'schema-advisor', 'SKILL.md'),
      },
    ]

    for (const { href, abs } of requiredTargets) {
      expect(
        existsSync(abs),
        `cross-link target "${href}" must exist on disk at ${abs}`,
      ).toBe(true)
      // The doc must actually mention the link target somewhere in its body.
      // We accept either the bare basename (e.g. "COOKBOOK.md") or the full
      // relative path — the basename match is sufficient for shape.
      const basename = href.split('/').pop()!
      expect(body, `migration guide must reference "${basename}"`).toContain(basename)
    }
  })
})
