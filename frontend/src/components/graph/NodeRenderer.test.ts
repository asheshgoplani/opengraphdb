import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { LABEL_COLORS, getLabelColor } from './NodeRenderer.js'

test('getLabelColor assigns deterministic colors by first-seen label', () => {
  const labelIndex = new Map<string, number>()

  const movieColor = getLabelColor('Movie', labelIndex)
  const personColor = getLabelColor('Person', labelIndex)

  assert.equal(movieColor, LABEL_COLORS[0])
  assert.equal(personColor, LABEL_COLORS[1])
  assert.equal(getLabelColor('Movie', labelIndex), movieColor)
  assert.equal(labelIndex.size, 2)
})
