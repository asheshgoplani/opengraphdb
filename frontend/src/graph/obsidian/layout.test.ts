import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ENTRY_DURATION_MS,
  ENTRY_OVERZOOM,
  TOP_HUB_LABELS_DEFAULT,
  compareLabelPriority,
  kHopNeighbors,
  neighborSet,
  seedPositions,
  selectEntryFocusNodeId,
  topHubsByDegree,
} from './layout.js'

test('seedPositions returns one entry per node and is deterministic', () => {
  const data = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    links: [],
  } as never
  const a = seedPositions(data)
  const b = seedPositions(data)
  assert.equal(a.size, 3)
  assert.deepEqual(a.get('a'), b.get('a'))
})

test('neighborSet includes self + direct neighbors only', () => {
  const data = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    links: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
    ],
  } as never
  const ns = neighborSet(data, 'a')
  assert.deepEqual([...ns].sort(), ['a', 'b'])
})

test('kHopNeighbors returns hop distances for k=2 on a chain a-b-c-d', () => {
  const data = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    links: [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c' },
      { source: 'c', target: 'd' },
    ],
  } as never
  const dist = kHopNeighbors(data, 'a', 2)
  assert.equal(dist.get('a'), 0)
  assert.equal(dist.get('b'), 1)
  assert.equal(dist.get('c'), 2)
  // d is 3 hops away — must be absent
  assert.equal(dist.has('d'), false)
})

test('kHopNeighbors handles isolated node (k=2)', () => {
  const data = {
    nodes: [{ id: 'a' }, { id: 'b' }],
    links: [],
  } as never
  const dist = kHopNeighbors(data, 'a', 2)
  assert.equal(dist.size, 1)
  assert.equal(dist.get('a'), 0)
})

test('kHopNeighbors does NOT promote 1-hop to 2-hop on cycles (BFS uses min distance)', () => {
  // a-b, a-c, b-c — both b and c are 1-hop, must not be relabelled as 2-hop
  // when reached again from the other side.
  const data = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    links: [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ],
  } as never
  const dist = kHopNeighbors(data, 'a', 2)
  assert.equal(dist.get('b'), 1)
  assert.equal(dist.get('c'), 1)
})

test('compareLabelPriority places focused node before higher-degree non-focused', () => {
  const degrees = new Map<string | number, number>([
    ['hub', 10],
    ['focus', 1],
    ['leaf', 0],
  ])
  const sorted = [{ id: 'hub' }, { id: 'focus' }, { id: 'leaf' }].sort((a, b) =>
    compareLabelPriority(a, b, 'focus', degrees),
  )
  assert.deepEqual(
    sorted.map((n) => n.id),
    ['focus', 'hub', 'leaf'],
  )
})

test('topHubsByDegree returns top-N ids in degree-desc order', () => {
  // Cycle C: pinned-default labels picks from this helper, so the order
  // and tie-breaking must match `compareLabelPriority`'s no-focus branch.
  const data = {
    nodes: [{ id: 'leaf' }, { id: 'mid' }, { id: 'hub' }, { id: 'iso' }],
    links: [],
  } as never
  const degrees = new Map<string | number, number>([
    ['hub', 10],
    ['mid', 3],
    ['leaf', 1],
    ['iso', 0],
  ])
  assert.deepEqual(topHubsByDegree(data, degrees, 3), ['hub', 'mid', 'leaf'])
})

test('topHubsByDegree breaks ties by stringified-id ascending', () => {
  const data = {
    nodes: [{ id: 'z' }, { id: 'a' }, { id: 'm' }],
    links: [],
  } as never
  const degrees = new Map<string | number, number>([
    ['z', 5],
    ['a', 5],
    ['m', 5],
  ])
  assert.deepEqual(topHubsByDegree(data, degrees, 3), ['a', 'm', 'z'])
})

test('topHubsByDegree caps at min(n, node-count) and treats n≤0 as empty', () => {
  const data = { nodes: [{ id: 'a' }, { id: 'b' }], links: [] } as never
  const degrees = new Map<string | number, number>([
    ['a', 1],
    ['b', 0],
  ])
  assert.deepEqual(topHubsByDegree(data, degrees, 10), ['a', 'b'])
  assert.deepEqual(topHubsByDegree(data, degrees, 0), [])
  assert.deepEqual(topHubsByDegree(data, degrees, -1), [])
})

test('ENTRY_OVERZOOM is greater than 1 — entry actually dollies inward', () => {
  // Cycle D: the entry animation is a "settle from outside". If overzoom
  // ever drifts to ≤1 the camera would START at fit, leaving the
  // animation invisible.
  assert.ok(
    ENTRY_OVERZOOM > 1,
    `ENTRY_OVERZOOM must be > 1 to produce a visible dolly, got ${ENTRY_OVERZOOM}`,
  )
})

test('ENTRY_DURATION_MS is long enough to read as motion, short enough not to lag', () => {
  // <400ms reads as a glitch; >2000ms feels sluggish on cold-load.
  assert.ok(
    ENTRY_DURATION_MS >= 400 && ENTRY_DURATION_MS <= 2000,
    `ENTRY_DURATION_MS must be in [400, 2000], got ${ENTRY_DURATION_MS}`,
  )
})

test('TOP_HUB_LABELS_DEFAULT is a sane positive constant', () => {
  // Pin the contract so accidental zero-or-negative drift is loud.
  assert.ok(
    TOP_HUB_LABELS_DEFAULT >= 4 && TOP_HUB_LABELS_DEFAULT <= 16,
    `TOP_HUB_LABELS_DEFAULT must be in [4, 16] for sensible default labelling, got ${TOP_HUB_LABELS_DEFAULT}`,
  )
})

test('selectEntryFocusNodeId returns the highest-degree node id (bold-redesign change 3)', () => {
  // The entry-dolly target. Tie-break must match topHubsByDegree, since
  // the user's pinned-label set and the camera dolly should agree on
  // which node is "the hub" to land on.
  const data = {
    nodes: [{ id: 'leaf' }, { id: 'mid' }, { id: 'hub' }, { id: 'iso' }],
    links: [],
  } as never
  const degrees = new Map<string | number, number>([
    ['hub', 10],
    ['mid', 3],
    ['leaf', 1],
    ['iso', 0],
  ])
  assert.equal(selectEntryFocusNodeId(data, degrees), 'hub')
})

test('selectEntryFocusNodeId returns null on an empty graph', () => {
  // Empty-graph fallback so the caller can default to viewport-fit and
  // not crash on an undefined node lookup.
  const data = { nodes: [], links: [] } as never
  assert.equal(selectEntryFocusNodeId(data, new Map()), null)
})

test('compareLabelPriority falls back to deterministic id order for equal-degree ties', () => {
  const degrees = new Map<string | number, number>([
    ['z', 5],
    ['a', 5],
    ['m', 5],
  ])
  const sorted = [{ id: 'z' }, { id: 'a' }, { id: 'm' }].sort((a, b) =>
    compareLabelPriority(a, b, null, degrees),
  )
  assert.deepEqual(
    sorted.map((n) => n.id),
    ['a', 'm', 'z'],
  )
})
