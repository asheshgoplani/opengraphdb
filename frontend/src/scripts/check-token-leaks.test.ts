import * as assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const compiledDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(compiledDir, '..', '..')
const scriptPath = resolve(frontendRoot, 'scripts', 'check-token-leaks.sh')

function runDetector(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bash', [scriptPath], {
    cwd: frontendRoot,
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function parseCount(stdout: string): number {
  const match = /^Token leaks detected: (\d+)/m.exec(stdout)
  if (!match) {
    throw new Error(`could not parse count from: ${stdout}`)
  }
  return Number(match[1])
}

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
  const result = runDetector()
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

// Inject-and-revert tests: write a temp .tsx file under frontend/src/components
// containing each pattern, confirm the detector count increases, then delete it.
// Each pattern goes on its own line so the line-counting `grep -c` registers
// each independently.
const injectFile = resolve(
  frontendRoot,
  'src',
  'components',
  '__token_leak_inject__.tsx'
)

function writeInject(patterns: string[]): void {
  const lines = patterns.map((p, i) => `// INJECT_${i}: ${p}`).join('\n')
  writeFileSync(injectFile, `${lines}\nexport {}\n`, 'utf8')
}

function clearInject(): void {
  if (existsSync(injectFile)) {
    unlinkSync(injectFile)
  }
}

test('detector catches shadeless white (text-white, bg-white, border-white)', () => {
  const before = parseCount(runDetector().stdout)
  try {
    writeInject(['text-white', 'bg-white', 'border-white'])
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after - before,
      3,
      `expected count to bump by 3 for shadeless whites, got delta ${after - before}`
    )
  } finally {
    clearInject()
  }
})

test('detector catches shadeless black (text-black, bg-black, ring-black)', () => {
  const before = parseCount(runDetector().stdout)
  try {
    writeInject(['text-black', 'bg-black', 'ring-black'])
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after - before,
      3,
      `expected count to bump by 3 for shadeless blacks, got delta ${after - before}`
    )
  } finally {
    clearInject()
  }
})

test('detector catches slash-shaded white/black (text-white/50, bg-black/20)', () => {
  const before = parseCount(runDetector().stdout)
  try {
    writeInject(['text-white/50', 'bg-black/20'])
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after - before,
      2,
      `expected count to bump by 2 for slash-shaded whites/blacks, got delta ${after - before}`
    )
  } finally {
    clearInject()
  }
})

test('detector catches numbered palette across full Tailwind color set', () => {
  const patterns = [
    'text-slate-700',
    'bg-neutral-100',
    'border-zinc-200',
    'ring-gray-300',
    'text-stone-500',
    'bg-orange-400',
    'text-yellow-300',
    'bg-lime-500',
    'text-green-600',
    'bg-teal-400',
    'text-blue-500',
    'bg-violet-600',
    'text-purple-700',
    'bg-fuchsia-500',
    'text-pink-400',
    'bg-rose-500',
  ]
  const before = parseCount(runDetector().stdout)
  try {
    writeInject(patterns)
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after - before,
      patterns.length,
      `expected count to bump by ${patterns.length} for numbered palette, got delta ${after - before}`
    )
  } finally {
    clearInject()
  }
})

test('detector catches gradient prefixes (from-/to-/via-)', () => {
  const before = parseCount(runDetector().stdout)
  try {
    writeInject(['from-blue-500', 'to-indigo-600', 'via-purple-400'])
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after - before,
      3,
      `expected count to bump by 3 for gradient prefixes, got delta ${after - before}`
    )
  } finally {
    clearInject()
  }
})

test('detector respects // allow-token-leak escape hatch', () => {
  const before = parseCount(runDetector().stdout)
  try {
    writeFileSync(
      injectFile,
      '// text-slate-700 // allow-token-leak\nexport {}\n',
      'utf8'
    )
    const after = parseCount(runDetector().stdout)
    assert.equal(
      after,
      before,
      'allow-token-leak comment should suppress the leak from the count'
    )
  } finally {
    clearInject()
  }
})

test('detector script declares baseline matching steady-state count', () => {
  const scriptSource = readFileSync(scriptPath, 'utf8')
  const baselineMatch = scriptSource.match(/^BASELINE=(\d+)$/m)
  assert.ok(baselineMatch, 'script must declare BASELINE=<n>')
  const baseline = Number(baselineMatch[1])
  const steadyState = parseCount(runDetector().stdout)
  assert.equal(
    steadyState,
    baseline,
    `BASELINE in script (${baseline}) must equal current detector count (${steadyState}); ratchet down or update intentionally`
  )
})
