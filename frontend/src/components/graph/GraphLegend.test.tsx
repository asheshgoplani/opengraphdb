import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { colorForLabel } from '../../graph/obsidian/colors.js'
import { GraphLegend } from './GraphLegend.js'

test('GraphLegend returns nothing when labels are empty', () => {
  const html = renderToStaticMarkup(
    <GraphLegend labels={[]} labelIndex={new Map()} isDark />,
  )
  assert.equal(html, '')
})

test('GraphLegend renders label entries with NODE-matching swatch colors', () => {
  // Cycle E: legend swatches must come from the same palette as nodes
  // (colorForLabel), not the legacy LABEL_COLORS hex set. Otherwise the
  // user reads "Movie = blue" in the legend while nodes render in amber.
  const labelIndex = new Map<string, number>([
    ['Movie', 0],
    ['Person', 1],
  ])
  const html = renderToStaticMarkup(
    <GraphLegend labels={['Movie', 'Person']} labelIndex={labelIndex} isDark />,
  )

  const movieColor = colorForLabel('Movie', true, labelIndex)
  const personColor = colorForLabel('Person', true, labelIndex)

  assert.match(html, /Legend/)
  assert.match(html, /Movie/)
  assert.match(html, /Person/)
  // Swatch background must be the colorForLabel output.
  assert.ok(
    html.includes(`background-color:${movieColor}`),
    `expected legend swatch to use ${movieColor}, html=${html}`,
  )
  assert.ok(
    html.includes(`background-color:${personColor}`),
    `expected legend swatch to use ${personColor}, html=${html}`,
  )
})

test('GraphLegend anchors top-left (cycle E)', () => {
  // Pre-cycle the legend lived bottom-left, where the playground page's
  // dataset switcher overlapped it on small viewports. Top-left is the
  // explicit ask AND clear of the existing top-right reset-view button.
  const html = renderToStaticMarkup(
    <GraphLegend
      labels={['Movie']}
      labelIndex={new Map([['Movie', 0]])}
      isDark
    />,
  )
  // Must include the new anchor classes; must NOT include the old.
  assert.match(html, /left-3/)
  assert.match(html, /top-3/)
  assert.ok(
    !html.includes('bottom-3'),
    `legend must not anchor bottom-3 anymore; html=${html}`,
  )
})

test('GraphLegend dark-mode swatch differs from light-mode swatch', () => {
  // The amber-cohesive palette has distinct dark/light variants. A
  // regression where isDark stopped propagating would silently make dark-
  // mode swatches use the light palette (washed-out on the dark backdrop).
  const labelIndex = new Map<string, number>([['Movie', 0]])
  const dark = renderToStaticMarkup(
    <GraphLegend labels={['Movie']} labelIndex={labelIndex} isDark />,
  )
  const light = renderToStaticMarkup(
    <GraphLegend labels={['Movie']} labelIndex={labelIndex} isDark={false} />,
  )
  assert.notEqual(dark, light, 'dark and light legend HTML must differ')
})
