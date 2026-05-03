import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// c17-ui L5 regression: the landing-page section eyebrows
// (FeaturesSection, SampleQueryPanel, AIIntegrationSection,
// BenchmarkStrip) all use tracking-[0.22em]. The footer's
// "BUILT FOR GRAPH-NATIVE WORKLOADS" used tracking-[0.18em] — same
// eyebrow style, four hundredths of an em tighter, just enough that
// "BUILT" read optically heavier than the section labels above it.
// Pin the footer eyebrow at 0.22em to match the section rhythm.
const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const landingPagePath = resolve(frontendRoot, 'src', 'pages', 'LandingPage.tsx')

function readSource(): string {
  return readFileSync(landingPagePath, 'utf8')
}

test('LandingPage footer eyebrow uses tracking-[0.22em] (matches section eyebrows)', () => {
  const src = readSource()
  // Find the <p> that renders the "Built for graph-native workloads" text.
  const eyebrowMatch = src.match(
    /<p\s+className="([^"]+)"[^>]*>\s*Built for graph-native workloads/i,
  )
  const className = eyebrowMatch?.[1]
  assert.ok(
    typeof className === 'string',
    'expected LandingPage footer to render a <p>Built for graph-native workloads</p>',
  )
  assert.match(
    className,
    /tracking-\[0\.22em\]/,
    `footer eyebrow must use tracking-[0.22em] to match section rhythm, got: ${className}`,
  )
})
