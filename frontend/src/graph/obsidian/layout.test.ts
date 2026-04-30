import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seedPositions, neighborSet } from './layout.js'

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
