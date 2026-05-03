import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNeighbourLookup,
  formatFocusAnnouncement,
  createDebouncedAnnouncer,
} from './keyboardNav.js'
import type { GraphData, GraphNode } from '@/types/graph'

const node = (
  id: string,
  x: number,
  y: number,
  labels: string[] = ['Movie'],
  extra: Record<string, unknown> = {},
): GraphNode => ({
  id,
  labels,
  properties: extra,
  x,
  y,
})

const data: GraphData = {
  nodes: [
    node('A', 0, 0),
    node('B', 100, 0),
    node('C', 0, 100),
    node('D', -100, 0),
    node('E', 0, -100),
  ],
  links: [
    { id: 'AB', source: 'A', target: 'B', type: 'R', properties: {} },
    { id: 'AC', source: 'A', target: 'C', type: 'R', properties: {} },
    { id: 'AD', source: 'A', target: 'D', type: 'R', properties: {} },
    { id: 'AE', source: 'A', target: 'E', type: 'R', properties: {} },
  ],
}

test('buildNeighbourLookup picks the right neighbour per direction', () => {
  const lookup = buildNeighbourLookup(data)
  assert.equal(lookup.next('A', 'right'), 'B')
  assert.equal(lookup.next('A', 'left'), 'D')
  assert.equal(lookup.next('A', 'down'), 'C')
  assert.equal(lookup.next('A', 'up'), 'E')
})

test('buildNeighbourLookup returns null for isolated nodes', () => {
  const isolated: GraphData = { nodes: [node('X', 0, 0)], links: [] }
  const lookup = buildNeighbourLookup(isolated)
  assert.equal(lookup.next('X', 'right'), null)
})

test('buildNeighbourLookup search matches label / property substrings', () => {
  const data2: GraphData = {
    nodes: [
      node('1', 0, 0, ['Movie'], { title: 'Inception' }),
      node('2', 0, 0, ['Movie'], { title: 'The Matrix' }),
      node('3', 0, 0, ['Genre'], { name: 'Action' }),
    ],
    links: [],
  }
  const lookup = buildNeighbourLookup(data2)
  assert.equal(lookup.search('inception')?.id, '1')
  assert.equal(lookup.search('matrix')?.id, '2')
  assert.equal(lookup.search('action')?.id, '3')
  assert.equal(lookup.search(''), null)
  assert.equal(lookup.search('   '), null)
})

test('formatFocusAnnouncement formats label + type + connections', () => {
  const n = node('1', 0, 0, ['Movie'], { title: 'Inception' })
  n.label = 'Inception'
  assert.equal(
    formatFocusAnnouncement(n, 4),
    'Selected: Inception. Type: Movie. 4 connections.',
  )
})

test('formatFocusAnnouncement uses singular for degree 1', () => {
  const n = node('1', 0, 0, ['Movie'])
  n.label = 'X'
  assert.equal(
    formatFocusAnnouncement(n, 1),
    'Selected: X. Type: Movie. 1 connection.',
  )
})

test('formatFocusAnnouncement returns empty string for null node', () => {
  assert.equal(formatFocusAnnouncement(null, 0), '')
})

// Minimal HTMLElement mock so we don't need a DOM in node:test.
class FakeElement {
  textContent: string = ''
}

test('createDebouncedAnnouncer emits the first message immediately', () => {
  const region = new FakeElement() as unknown as HTMLElement
  const a = createDebouncedAnnouncer(region, 600)
  a.announce('first')
  assert.equal((region as unknown as FakeElement).textContent, 'first')
})

test('createDebouncedAnnouncer debounces rapid calls', async () => {
  const region = new FakeElement() as unknown as HTMLElement
  const a = createDebouncedAnnouncer(region, 50)
  a.announce('one') // emits immediately
  a.announce('two') // queued
  a.announce('three') // queued
  await new Promise((r) => setTimeout(r, 80))
  assert.equal((region as unknown as FakeElement).textContent, 'three')
})

test('createDebouncedAnnouncer flush forces immediate emit', () => {
  const region = new FakeElement() as unknown as HTMLElement
  const a = createDebouncedAnnouncer(region, 600)
  a.announce('first') // emits immediately
  a.announce('second') // pending
  assert.equal((region as unknown as FakeElement).textContent, 'first')
  a.flush()
  assert.equal((region as unknown as FakeElement).textContent, 'second')
})
