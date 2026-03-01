import * as assert from 'node:assert/strict'
import { test } from 'node:test'
import { getNextTheme } from './theme-utils.js'

test('getNextTheme cycles from system to light', () => {
  assert.equal(getNextTheme('system'), 'light')
})

test('getNextTheme cycles from light to dark', () => {
  assert.equal(getNextTheme('light'), 'dark')
})

test('getNextTheme cycles from dark to system', () => {
  assert.equal(getNextTheme('dark'), 'system')
})
