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
  public globalAlpha = 1
  public canvas = { width: 1920, height: 1080 }

  beginPath() {}
  save() {}
  restore() {}
  fill() {}
  stroke() {}

  getTransform() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  }

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

const mockColors: CanvasColors = {
  bg: '#0f0f1a',
  text: '#e2e8f0',
  edge: '#334155',
  border: '#1e293b',
  nodeText: '#f1f5f9',
  gridDot: '#1e293b',
  nodeShadow: 'rgba(99, 102, 241, 0.3)',
  edgeLabel: '#94a3b8',
  edgeLabelBg: 'rgba(15, 15, 26, 0.85)',
  traceGlow: '#00d4ff',
  dimmedAlpha: 0.15,
}

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

test('paintNode with traceState renders traversed node without error and records glow color', () => {
  const labelIndex = new Map<string, number>()
  const assignedShadowColors: string[] = []
  const ctx = new MockCanvasContext()

  // Track shadow color assignments to verify traceGlow was used
  Object.defineProperty(ctx, 'shadowColor', {
    get() { return this._shadowColor ?? '' },
    set(v: string) {
      this._shadowColor = v
      assignedShadowColors.push(v)
    },
  })

  const node: GraphNode = {
    id: 'n1',
    labels: ['Person'],
    properties: { name: 'Alice' },
    x: 100,
    y: 100,
  }
  const traceState = {
    activeNodeId: null,
    traversedNodeIds: new Set<string | number>(['n1']),
    isPlaying: true,
  }

  // Should complete without throwing even with traceState active
  assert.doesNotThrow(() => {
    paintNode(
      node,
      ctx as unknown as CanvasRenderingContext2D,
      1,
      mockColors,
      labelIndex,
      undefined,
      traceState
    )
  })

  // Traversed node should render (gradients drawn) and at some point use traceGlow
  assert.ok(ctx.gradients.length >= 1)
  assert.ok(
    assignedShadowColors.includes(mockColors.traceGlow),
    `Expected traceGlow color '${mockColors.traceGlow}' in shadow assignments: ${JSON.stringify(assignedShadowColors)}`
  )
})
