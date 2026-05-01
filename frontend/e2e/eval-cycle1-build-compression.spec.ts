import { expect, test } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression for H2 — assumes the S6 build-targets spec ran first (or that
// `npm run build` was invoked). Asserts that production builds emit:
//   1. Hidden source maps (.map files alongside JS chunks)
//   2. gzip + brotli pre-compressed siblings (.gz + .br)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FRONTEND_DIR = path.resolve(__dirname, '..')

test.describe('H2 — sourcemaps + gzip/brotli compression', () => {
  for (const dist of ['dist-marketing', 'dist-app']) {
    test(`${dist}/assets emits hidden sourcemaps + .gz + .br siblings`, () => {
      const assetsDir = path.join(FRONTEND_DIR, dist, 'assets')
      if (!existsSync(assetsDir)) test.skip(true, `${dist}/assets missing — run npm run build`)

      const files = readdirSync(assetsDir)
      expect(files.some((f) => f.endsWith('.js.map')), 'expected .js.map files').toBe(true)
      expect(files.some((f) => f.endsWith('.js.gz')), 'expected .js.gz files').toBe(true)
      expect(files.some((f) => f.endsWith('.js.br')), 'expected .js.br files').toBe(true)
    })
  }
})
