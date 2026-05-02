import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOOLTIP_MAX_PROPS,
  formatTooltipValue,
  pickTooltipProps,
} from './tooltip.js'

test('formatTooltipValue stringifies primitives, drops null/undefined/objects', () => {
  assert.equal(formatTooltipValue('hello'), 'hello')
  assert.equal(formatTooltipValue(42), '42')
  assert.equal(formatTooltipValue(true), 'true')
  assert.equal(formatTooltipValue(null), '')
  assert.equal(formatTooltipValue(undefined), '')
  assert.equal(formatTooltipValue({ x: 1 }), '')
  assert.equal(formatTooltipValue([1, 2]), '')
})

test('formatTooltipValue truncates long strings (>40 chars) with ellipsis', () => {
  const long = 'x'.repeat(60)
  const out = formatTooltipValue(long)
  assert.equal(out.length, 40)
  assert.ok(out.endsWith('…'))
})

test('pickTooltipProps returns empty for missing/empty properties', () => {
  assert.deepEqual(pickTooltipProps(undefined), [])
  assert.deepEqual(pickTooltipProps({}), [])
  // Non-curated keys are not surfaced.
  assert.deepEqual(pickTooltipProps({ secretKey: 'x', _internal: 7 }), [])
})

test('pickTooltipProps caps to TOOLTIP_MAX_PROPS even when more curated keys exist', () => {
  const out = pickTooltipProps({
    name: 'Alice',
    title: 'Dr',
    description: 'desc',
    type: 'person',
    category: 'employee',
  })
  assert.equal(out.length, TOOLTIP_MAX_PROPS)
  assert.deepEqual(
    out.map(([k]) => k),
    ['name', 'title'],
  )
})

test('pickTooltipProps falls through curated key list when earlier keys are absent', () => {
  const out = pickTooltipProps({ category: 'tools', type: 'cli' })
  // Order is the curated key order; type comes before category.
  assert.deepEqual(
    out.map(([k]) => k),
    ['type', 'category'],
  )
})

test('pickTooltipProps skips keys whose values are not primitive (e.g. objects)', () => {
  const out = pickTooltipProps({
    name: { nested: 'object' },
    title: 'Plain title',
  })
  assert.equal(out.length, 1)
  assert.deepEqual(
    out.map(([k]) => k),
    ['title'],
  )
})
