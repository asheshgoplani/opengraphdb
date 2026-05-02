import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareLabelPriority,
  kHopNeighbors,
  neighborSet,
  seedPositions,
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
