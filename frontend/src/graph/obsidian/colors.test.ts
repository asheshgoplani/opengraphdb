import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EDGE_COLOR_DARK,
  EDGE_COLOR_LIGHT,
  EDGE_WIDTH_BASE,
  EDGE_WIDTH_FOCUS,
  NODE_PALETTE_DARK,
  NODE_PALETTE_LIGHT,
  colorForLabel,
} from './colors.js'

function alphaOf(hsla: string): number {
  const m = hsla.match(/\/\s*([\d.]+)\s*\)/)
  return m ? Number(m[1]) : 1
}

test('NODE_PALETTE_DARK has six well-separated AMBER-TERMINAL slots', () => {
  // Six slots is the contract callers (ObsidianGraph, HeroGraphBackground)
  // rely on. If this length changes we need to update both palettes in
  // lockstep — pin it here so a single-side edit fails loudly.
  assert.equal(NODE_PALETTE_DARK.length, 6)
  assert.equal(NODE_PALETTE_LIGHT.length, 6)
  // Each slot must be a distinct hsl() string — guards against accidental
  // dedupe-via-typo where two slots collapse to the same color.
  const uniq = new Set(NODE_PALETTE_DARK)
  assert.equal(uniq.size, NODE_PALETTE_DARK.length)
})

test('colorForLabel falls back to first slot for empty/undefined label', () => {
  assert.equal(colorForLabel(undefined, true), NODE_PALETTE_DARK[0])
  assert.equal(colorForLabel('', true), NODE_PALETTE_DARK[0])
  assert.equal(colorForLabel(undefined, false), NODE_PALETTE_LIGHT[0])
})

test('colorForLabel without labelIndex is deterministic for a given label', () => {
  const a = colorForLabel('Movie', true)
  const b = colorForLabel('Movie', true)
  assert.equal(a, b)
})

test('colorForLabel with labelIndex assigns distinct slots to distinct labels (≤ palette length)', () => {
  // Regression for "all nodes render in similar amber tones": when distinct
  // labels hashed into the same palette slot, three Movie/Genre/Person
  // ontologies could land on the same color. Routing through labelIndex
  // guarantees one-to-one until we exceed palette length.
  const labelIndex = new Map<string, number>([
    ['Movie', 0],
    ['Person', 1],
    ['Genre', 2],
    ['Director', 3],
    ['Studio', 4],
    ['Tag', 5],
  ])
  const seen = new Set<string>()
  for (const [label] of labelIndex) {
    seen.add(colorForLabel(label, true, labelIndex))
  }
  // All six labels must occupy distinct palette slots.
  assert.equal(seen.size, 6)
})

test('colorForLabel with labelIndex wraps modulo palette length past the 6th label', () => {
  const labelIndex = new Map<string, number>([
    ['L0', 0],
    ['L6', 6],
  ])
  // Index 6 wraps to slot 0, matching the same color as index-0 label.
  assert.equal(
    colorForLabel('L6', true, labelIndex),
    colorForLabel('L0', true, labelIndex),
  )
})

test('EDGE_COLOR_* alpha is high enough to read against the playground bg', () => {
  // Regression for "edges nearly invisible against dark background".
  // Below 0.4 the edge haze loses connective-tissue legibility on the
  // playground backdrop. Pin a floor so future palette edits can't drift
  // back into invisibility.
  assert.ok(
    alphaOf(EDGE_COLOR_DARK) >= 0.4,
    `EDGE_COLOR_DARK alpha must be ≥ 0.4 for legibility, got ${alphaOf(EDGE_COLOR_DARK)}`,
  )
  assert.ok(
    alphaOf(EDGE_COLOR_LIGHT) >= 0.4,
    `EDGE_COLOR_LIGHT alpha must be ≥ 0.4 for legibility, got ${alphaOf(EDGE_COLOR_LIGHT)}`,
  )
})

test('EDGE_WIDTH_BASE is thicker than the historical 1.2px hairline', () => {
  // Pre-cycle-B value was 1.2 — at this width edges read as a haze, not a
  // structure. Pin a floor of 1.5 so we can't slip back into hairline
  // territory without a deliberate new threshold.
  assert.ok(
    EDGE_WIDTH_BASE >= 1.5,
    `EDGE_WIDTH_BASE must be ≥ 1.5px to render as connective tissue, got ${EDGE_WIDTH_BASE}`,
  )
})

test('EDGE_WIDTH_FOCUS is strictly thicker than EDGE_WIDTH_BASE', () => {
  // The focused subgraph must stand out by stroke width alone, not just
  // color/alpha — so the focus stroke must be measurably thicker than base.
  assert.ok(
    EDGE_WIDTH_FOCUS > EDGE_WIDTH_BASE,
    `EDGE_WIDTH_FOCUS (${EDGE_WIDTH_FOCUS}) must be > EDGE_WIDTH_BASE (${EDGE_WIDTH_BASE})`,
  )
})

test('colorForLabel with labelIndex falls through to hash for unknown labels', () => {
  // A label not present in the index must still resolve (hash fallback)
  // rather than returning fallback or undefined — important because the
  // index is keyed by primary label only; nodes can have a different
  // first-label string than what GraphCanvas indexed.
  const labelIndex = new Map<string, number>([['Movie', 0]])
  const c = colorForLabel('UnknownLabel', true, labelIndex)
  assert.match(c, /^hsl\(/)
})
