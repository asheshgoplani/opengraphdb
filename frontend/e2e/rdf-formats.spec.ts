import { expect, test, type Page } from '@playwright/test'

// COVERAGE-AUDIT.md H2 — RDF upload covers TTL only; the other six
// extensions (.nt, .jsonld, .nq, .n3, .rdf, .xml) are untested (UC7 /
// AE6).
//
// `rdf-import-real.spec.ts` already exercises the full backend round-
// trip for TTL; here we cover the FRONTEND contract for the remaining
// formats by mocking `/api/rdf/import` and asserting:
//   1. each extension routes to the correct `?format=` query parameter
//      (per `rdfFormatFromFilename` in src/lib/rdfClient.ts)
//   2. the request carries the format-specific Content-Type
//   3. on a 200 response the persisted UI ("rdf-import-persisted") is
//      visible — proving the success branch in RDFDropzone runs.
//
// We deliberately stay frontend-only: spawning ogdb for every format
// adds 6× the cost of `rdf-import-real` and the parser-level coverage
// belongs in the Rust crate, not here.

interface FormatCase {
  filename: string
  fileType: string
  // Sample text the in-browser parser can recognise (the parser will
  // refuse to advance past parsing if zero triples are recognised; we
  // need at least one triple per fixture). Turtle-shaped text is fine
  // for .n3/.rdf/.xml because the parser falls back to turtle for
  // those extensions.
  body: string
  expectedFormat: 'nt' | 'jsonld' | 'nq' | 'xml'
  expectedContentType: string
}

const TURTLE_SAMPLE = `@prefix ex: <http://example.org/h2/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

ex:alice a foaf:Person ; foaf:name "Alice" ; foaf:knows ex:bob .
ex:bob   a foaf:Person ; foaf:name "Bob"   ; foaf:knows ex:alice .
`

const NT_SAMPLE = `<http://example.org/h2/alice> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Person> .
<http://example.org/h2/alice> <http://xmlns.com/foaf/0.1/name> "Alice" .
<http://example.org/h2/alice> <http://xmlns.com/foaf/0.1/knows> <http://example.org/h2/bob> .
`

const NQ_SAMPLE = `<http://example.org/h2/alice> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://xmlns.com/foaf/0.1/Person> <http://example.org/h2/g1> .
<http://example.org/h2/alice> <http://xmlns.com/foaf/0.1/knows> <http://example.org/h2/bob> <http://example.org/h2/g1> .
`

const JSONLD_SAMPLE = JSON.stringify(
  {
    '@context': { name: 'http://xmlns.com/foaf/0.1/name', knows: 'http://xmlns.com/foaf/0.1/knows' },
    '@id': 'http://example.org/h2/alice',
    '@type': 'http://xmlns.com/foaf/0.1/Person',
    name: 'Alice',
    knows: { '@id': 'http://example.org/h2/bob' },
  },
  null,
  2,
)

const CASES: FormatCase[] = [
  {
    filename: 'sample.nt',
    fileType: 'application/n-triples',
    body: NT_SAMPLE,
    expectedFormat: 'nt',
    expectedContentType: 'application/n-triples',
  },
  {
    filename: 'sample.jsonld',
    fileType: 'application/ld+json',
    body: JSONLD_SAMPLE,
    expectedFormat: 'jsonld',
    expectedContentType: 'application/ld+json',
  },
  {
    filename: 'sample.nq',
    fileType: 'application/n-quads',
    body: NQ_SAMPLE,
    expectedFormat: 'nq',
    expectedContentType: 'application/n-quads',
  },
  {
    // .n3 maps to nt format per FORMAT_BY_EXTENSION; in-browser parser
    // treats .n3 content as turtle, so a turtle body parses fine.
    filename: 'sample.n3',
    fileType: 'text/n3',
    body: TURTLE_SAMPLE,
    expectedFormat: 'nt',
    expectedContentType: 'application/n-triples',
  },
  {
    // .rdf maps to xml format per FORMAT_BY_EXTENSION. Real RDF/XML
    // wouldn't parse in our turtle parser, but the frontend dropzone
    // falls back to turtle for non-jsonld/nt/nq files, so we can use
    // a turtle body purely to satisfy the "≥1 triple" precondition;
    // the assertion that matters is `?format=xml` on the wire.
    filename: 'sample.rdf',
    fileType: 'application/rdf+xml',
    body: TURTLE_SAMPLE,
    expectedFormat: 'xml',
    expectedContentType: 'application/rdf+xml',
  },
  {
    filename: 'sample.xml',
    fileType: 'application/rdf+xml',
    body: TURTLE_SAMPLE,
    expectedFormat: 'xml',
    expectedContentType: 'application/rdf+xml',
  },
]

interface CapturedRequest {
  url: string
  method: string
  contentType: string | null
}

async function dropFile(page: Page, body: string, filename: string, fileType: string): Promise<void> {
  await page.evaluate(
    ([content, name, type]) => {
      const file = new File([content], name, { type })
      const dt = new DataTransfer()
      dt.items.add(file)
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
      document.body.dispatchEvent(dropEvent)
    },
    [body, filename, fileType],
  )
}

test.describe('H2 — RDF upload covers all six remaining formats (frontend contract)', () => {
  for (const c of CASES) {
    test(`${c.filename} → POST /api/rdf/import?format=${c.expectedFormat} with Content-Type ${c.expectedContentType}`, async ({ page }) => {
      const captured: CapturedRequest[] = []

      // Mock the backend so we don't depend on ogdb being running. Every
      // format is allowed to "succeed" via the mock; what we're asserting
      // is the URL + Content-Type the dropzone produced.
      await page.route('**/api/rdf/import**', async (route) => {
        const req = route.request()
        captured.push({
          url: req.url(),
          method: req.method(),
          contentType: req.headers()['content-type'] ?? null,
        })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            db_path: '/tmp/h2-mock.ogdb',
            format: c.expectedFormat,
            processed_records: 1,
            imported_nodes: 2,
            imported_edges: 1,
            total_nodes: 2,
            total_edges: 1,
          }),
        })
      })

      await page.goto('/playground')
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('rdf-dropzone-trigger')).toBeVisible({
        timeout: 10_000,
      })

      await dropFile(page, c.body, c.filename, c.fileType)

      // Preview dialog opens with a Commit button once parsing succeeds.
      const commit = page.getByTestId('rdf-import-commit')
      await expect(commit).toBeVisible({ timeout: 5000 })

      const importResp = page.waitForResponse(
        (r) => r.url().includes('/api/rdf/import'),
        { timeout: 10_000 },
      )
      await commit.click()
      const resp = await importResp
      expect(resp.status()).toBe(200)

      // Persisted banner proves RDFDropzone took the success branch.
      await expect(page.getByTestId('rdf-import-persisted')).toBeVisible({
        timeout: 5000,
      })

      // Frontend contract: format query param + Content-Type header.
      expect(captured, `expected one POST for ${c.filename}`).toHaveLength(1)
      const req = captured[0]
      expect(req.method).toBe('POST')
      const url = new URL(req.url)
      expect(url.pathname).toBe('/api/rdf/import')
      expect(url.searchParams.get('format')).toBe(c.expectedFormat)
      expect(req.contentType).toBe(c.expectedContentType)
    })
  }
})
