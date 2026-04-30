import { expect, test } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// S6 smoke test: the marketing site and the embedded app SPA build into
// separate dist directories from the same source tree. Each run wipes both
// outputs and re-runs the two build scripts so the spec is self-sufficient
// (no prior `npm run build` required) and can't hide a stale-artifact pass.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FRONTEND_DIR = path.resolve(__dirname, '..')

test.describe('S6 — vite build split: build:marketing + build:app', () => {
  test.beforeAll(() => {
    rmSync(path.join(FRONTEND_DIR, 'dist-marketing'), { recursive: true, force: true })
    rmSync(path.join(FRONTEND_DIR, 'dist-app'), { recursive: true, force: true })
    execSync('npm run build:marketing', { cwd: FRONTEND_DIR, stdio: 'inherit' })
    execSync('npm run build:app', { cwd: FRONTEND_DIR, stdio: 'inherit' })
  })

  test.setTimeout(300_000)

  test('build:marketing produces dist-marketing/index.html', () => {
    expect(existsSync(path.join(FRONTEND_DIR, 'dist-marketing', 'index.html'))).toBe(true)
  })

  test('build:app produces dist-app/index.html', () => {
    expect(existsSync(path.join(FRONTEND_DIR, 'dist-app', 'index.html'))).toBe(true)
  })

  test('marketing and app dist directories are independent', () => {
    expect(existsSync(path.join(FRONTEND_DIR, 'dist-marketing'))).toBe(true)
    expect(existsSync(path.join(FRONTEND_DIR, 'dist-app'))).toBe(true)
  })
})
