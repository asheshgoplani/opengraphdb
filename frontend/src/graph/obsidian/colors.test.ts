import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NODE_PALETTE_DARK,
  NODE_PALETTE_LIGHT,
  colorForLabel,
} from './colors.js'

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

test('colorForLabel with labelIndex falls through to hash for unknown labels', () => {
  // A label not present in the index must still resolve (hash fallback)
  // rather than returning fallback or undefined — important because the
  // index is keyed by primary label only; nodes can have a different
  // first-label string than what GraphCanvas indexed.
  const labelIndex = new Map<string, number>([['Movie', 0]])
  const c = colorForLabel('UnknownLabel', true, labelIndex)
  assert.match(c, /^hsl\(/)
})
