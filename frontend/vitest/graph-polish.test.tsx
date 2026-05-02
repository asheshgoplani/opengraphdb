import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GraphLegend } from '../src/components/graph/GraphLegend'
import { LABEL_COLORS, getLabelColor } from '../src/components/graph/NodeRenderer'
import { colorForLabel } from '../src/graph/obsidian/colors'

describe('graph polish', () => {
  it('keeps the legacy NodeRenderer LABEL_COLORS deterministic for non-legend callers', () => {
    // NodeRenderer.getLabelColor is still used outside the legend path —
    // pin its determinism so we don't accidentally regress that contract
    // while reworking the legend.
    const labelIndex = new Map<string, number>()

    expect(getLabelColor('Movie', labelIndex)).toBe(LABEL_COLORS[0])
    expect(getLabelColor('Person', labelIndex)).toBe(LABEL_COLORS[1])
    expect(getLabelColor('Movie', labelIndex)).toBe(LABEL_COLORS[0])
  })

  it('renders graph legend at top-left with NODE-matching swatch colors', () => {
    // Cycle E (visible polish): legend lives top-left and swatches come
    // from colorForLabel — same palette as the rendered nodes — so the
    // legend describes what the user actually sees.
    const labelIndex = new Map<string, number>([
      ['Movie', 0],
      ['Person', 1],
    ])

    const html = renderToStaticMarkup(
      <GraphLegend labels={['Movie', 'Person']} labelIndex={labelIndex} isDark />
    )

    expect(html).toContain('Legend')
    expect(html).toContain('left-3')
    expect(html).toContain('top-3')
    expect(html).not.toContain('bottom-3')
    expect(html).toContain(
      `background-color:${colorForLabel('Movie', true, labelIndex)}`
    )
    expect(html).toContain(
      `background-color:${colorForLabel('Person', true, labelIndex)}`
    )
  })
})
