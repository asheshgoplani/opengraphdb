import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { getLabelColor } from './NodeRenderer.js'
import { GraphLegend } from './GraphLegend.js'

test('GraphLegend returns nothing when labels are empty', () => {
  const html = renderToStaticMarkup(<GraphLegend labels={[]} labelIndex={new Map()} />)
  assert.equal(html, '')
})

test('GraphLegend renders label entries with mapped colors', () => {
  const labelIndex = new Map<string, number>([
    ['Movie', 0],
    ['Person', 1],
  ])
  const html = renderToStaticMarkup(
    <GraphLegend labels={['Movie', 'Person']} labelIndex={labelIndex} />
  )

  const movieColor = getLabelColor('Movie', labelIndex)

  assert.match(html, /Legend/)
  assert.match(html, /Movie/)
  assert.match(html, /Person/)
  assert.match(html, new RegExp(`background-color:${movieColor}`))
})
