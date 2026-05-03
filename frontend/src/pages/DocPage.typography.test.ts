import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// c17-ui L1 regression: the doc page used to render its prose with the
// Tailwind typography defaults — h1/h2/h3 fell back to Inter while every
// other display surface in the app (landing <h1>, claims <h1>, the
// DocPage 404 fallback) uses Fraunces via `font-display`. The handoff
// from a marketing surface to a `/docs/<slug>` page felt typographically
// wrong. Pin the prose-heading override so future refactors of the
// article className don't silently regress the rhythm.
const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const docPagePath = resolve(frontendRoot, 'src', 'pages', 'DocPage.tsx')

function readSource(): string {
  return readFileSync(docPagePath, 'utf8')
}

test('DocPage article applies font-display to prose headings', () => {
  const src = readSource()
  const articleMatch = src.match(/<article\b[^>]*className="([^"]+)"/)
  const className = articleMatch?.[1]
  assert.ok(
    typeof className === 'string',
    'expected DocPage to render an <article className="..."> element',
  )
  assert.match(
    className,
    /prose-headings:font-display/,
    `article must apply prose-headings:font-display so doc h1/h2/h3 use Fraunces, got: ${className}`,
  )
})
