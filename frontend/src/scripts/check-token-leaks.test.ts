import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const scriptPath = resolve(frontendRoot, 'scripts', 'check-token-leaks.sh')

test('check-token-leaks.sh exists in frontend/scripts/', () => {
  assert.ok(
    existsSync(scriptPath),
    `expected token-leak detector at ${scriptPath}`
  )
})

test('check-token-leaks.sh is executable', () => {
  const mode = statSync(scriptPath).mode
  assert.ok((mode & 0o111) !== 0, 'script should have executable bits set')
})

test('check-token-leaks.sh exits 0 and prints baseline count', () => {
  const result = spawnSync('bash', [scriptPath], {
    cwd: frontendRoot,
    encoding: 'utf8',
  })
  assert.equal(
    result.status,
    0,
    `script exited ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  )
  assert.match(
    result.stdout,
    /^Token leaks detected: \d+/m,
    'first line should be "Token leaks detected: <number>"'
  )
})
