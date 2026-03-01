import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GraphNode } from '@/types/graph'
import type { CanvasColors } from './canvasColors.js'
import { LABEL_COLORS, getLabelColor, paintNode } from './NodeRenderer.js'

class MockGradient {
  public stops: Array<{ offset: number; color: string }> = []

  addColorStop(offset: number, color: string) {
    this.stops.push({ offset, color })
  }
}

class MockCanvasContext {
  public arcs: Array<{ x: number; y: number; radius: number }> = []
  public texts: Array<{ text: string; x: number; y: number }> = []
  public gradients: MockGradient[] = []

  public fillStyle: string | CanvasGradient = ''
  public strokeStyle: string | CanvasGradient = ''
  public lineWidth = 0
  public shadowColor = ''
  public shadowBlur = 0
  public font = ''
  public textAlign: CanvasTextAlign = 'start'
  public textBaseline: CanvasTextBaseline = 'alphabetic'

  beginPath() {}
  save() {}
  restore() {}
  fill() {}
  stroke() {}

  arc(x: number, y: number, radius: number) {
    this.arcs.push({ x, y, radius })
  }

  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y })
  }

  measureText(text: string) {
    return { width: text.length * 6 } as TextMetrics
  }

  createRadialGradient() {
    const gradient = new MockGradient()
    this.gradients.push(gradient)
    return gradient as unknown as CanvasGradient
  }
}

const mockColors = {
  bg: '#0f0f1a',
  text: '#e2e8f0',
  edge: '#334155',
  border: '#1e293b',
  nodeText: '#f1f5f9',
  gridDot: '#1e293b',
  nodeShadow: 'rgba(99, 102, 241, 0.3)',
  edgeLabel: '#94a3b8',
  edgeLabelBg: 'rgba(15, 15, 26, 0.85)',
} as CanvasColors

test('getLabelColor assigns deterministic colors by first-seen label', () => {
  const labelIndex = new Map<string, number>()

  const movieColor = getLabelColor('Movie', labelIndex)
  const personColor = getLabelColor('Person', labelIndex)

  assert.equal(movieColor, LABEL_COLORS[0])
  assert.equal(personColor, LABEL_COLORS[1])
  assert.equal(getLabelColor('Movie', labelIndex), movieColor)
  assert.equal(labelIndex.size, 2)
})

test('paintNode scales radius by connection count and uses display name from properties', () => {
  const labelIndex = new Map<string, number>()
  const connectionCounts = new Map<string | number, number>([[1, 10]])
  const ctx = new MockCanvasContext()
  const title = 'An Extremely Long Movie Title Here'
  const node: GraphNode = {
    id: 1,
    labels: ['Movie'],
    properties: { title },
    x: 50,
    y: 60,
  }

  paintNode(
    node,
    ctx as unknown as CanvasRenderingContext2D,
    1,
    mockColors,
    labelIndex,
    connectionCounts
  )

  assert.ok(ctx.gradients.length >= 1)
  assert.equal(ctx.arcs[0]?.radius, 10)
  assert.equal(ctx.font.includes('500'), true)
  assert.equal(ctx.texts[0]?.text, `${title.slice(0, 15)}...`)
})
