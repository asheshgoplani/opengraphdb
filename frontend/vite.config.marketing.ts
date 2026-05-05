import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Rollup names emitted HTML after the source filename, so a build with
// `index-marketing.html` as input produces `dist-marketing/index-marketing.html`.
// The acceptance gate (and S7 embed) expects `dist-marketing/index.html` —
// rename it after the bundle is closed.
function renameHtmlOutput(from: string, to: string): Plugin {
  return {
    name: 'ogdb-rename-html-output',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist-marketing')
      const src = path.join(outDir, from)
      const dst = path.join(outDir, to)
      if (fs.existsSync(src)) fs.renameSync(src, dst)
    },
  }
}

// S6: marketing build target.
// Inputs `index-marketing.html` (which loads `src/marketing-main.tsx`) and
// emits to `dist-marketing/`. The marketing bundle ships only LandingPage —
// playground/codemirror/graph live in the separate `vite.config.app.ts`
// build, so this dist stays small and independent of the embedded SPA.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// F03 (EVAL-DOCS-COMPLETENESS-CYCLE15): hero badge version is sourced from
// `[workspace.package].version` in Cargo.toml at config-load time and
// injected via `define` so the marketing bundle never drifts against the
// shipped binary's version.
function readWorkspaceVersion(): string {
  const cargoPath = path.resolve(__dirname, '..', 'Cargo.toml')
  const cargo = fs.readFileSync(cargoPath, 'utf8')
  const m = cargo.match(/\[workspace\.package\][^[]*?\nversion\s*=\s*"([^"]+)"/m)
  if (!m) {
    throw new Error(
      `vite.config.marketing.ts: could not parse [workspace.package].version from ${cargoPath}`,
    )
  }
  return m[1]
}

const OGDB_VERSION = readWorkspaceVersion()

export default defineConfig({
  plugins: [
    react(),
    renameHtmlOutput('index-marketing.html', 'index.html'),
    compression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
    compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_OGDB_VERSION': JSON.stringify(OGDB_VERSION),
  },
  build: {
    outDir: 'dist-marketing',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: path.resolve(__dirname, 'index-marketing.html'),
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-router-dom') || id.includes('node_modules/react-router/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-')) {
            return 'motion-vendor'
          }
          return undefined
        },
      },
    },
  },
})
