import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// c17-ui L4 regression: the "Last query" eyebrow at tracking-[0.2em]
// (line 76 in pre-fix HEAD) and the cell-level Rows/Nodes/Edges/Total
// eyebrows at tracking-[0.18em] (line 33) sit side-by-side in the same
// strip. A 0.02em difference in tracking inside one micro-component
// reads as accidental design drift, not hierarchy. Pin the unified
// 0.2em so a refactor can't silently re-split them.
const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..', '..')
const perfStripPath = resolve(
  frontendRoot,
  'src',
  'components',
  'playground',
  'PerfStrip.tsx',
)

function readSource(): string {
  return readFileSync(perfStripPath, 'utf8')
}

test('PerfStrip eyebrow labels share a single letter-spacing', () => {
  const src = readSource()
  // Capture every distinct tracking-[<value>em] used inside the file.
  const matches = Array.from(src.matchAll(/tracking-\[(0?\.[0-9]+)em\]/g))
  const values = new Set(matches.map((m) => m[1]))
  assert.ok(
    matches.length >= 2,
    `expected PerfStrip to use ≥2 tracking-[…em] eyebrows, got ${matches.length}`,
  )
  assert.equal(
    values.size,
    1,
    `PerfStrip eyebrow tracking must be uniform; found values: ${[...values].join(', ')}`,
  )
})
