import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export default {
  resolve: {
    alias: {
      '@': resolve(currentDir, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['vitest/**/*.test.ts', 'vitest/**/*.test.tsx'],
    exclude: ['**/.test-dist/**', '**/node_modules/**'],
  },
}
