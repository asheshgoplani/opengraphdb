import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// S6: embedded-app build target.
// Inputs `index-app.html` (which loads `src/app-main.tsx`) and emits to
// `dist-app/`. This bundle is what S7 will embed via include_dir! and
// serve from the `ogdb` binary. Carries the dev-server middleware the
// playground needs (cypher lint worker + /api proxy) so `npm run dev:app`
// produces an interactive console identical to today's all-routes dev.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// F03 (EVAL-DOCS-COMPLETENESS-CYCLE15): the hero version badge used to be
// hard-coded and drifted against `[workspace.package].version` for two
// minor releases. Read the workspace version from Cargo.toml at config-load
// time and inject it via `define` as `import.meta.env.VITE_OGDB_VERSION`.
function readWorkspaceVersion(): string {
  const cargoPath = path.resolve(__dirname, '..', 'Cargo.toml')
  const cargo = fs.readFileSync(cargoPath, 'utf8')
  const m = cargo.match(/\[workspace\.package\][^[]*?\nversion\s*=\s*"([^"]+)"/m)
  if (!m) {
    throw new Error(
      `vite.config.app.ts: could not parse [workspace.package].version from ${cargoPath}`,
    )
  }
  return m[1]
}

const OGDB_VERSION = readWorkspaceVersion()

// Rollup names emitted HTML after the source filename, so a build with
// `index-app.html` as input produces `dist-app/index-app.html`. The
// acceptance gate (and S7 embed) expects `dist-app/index.html` — rename
// it after the bundle is closed.
function renameHtmlOutput(from: string, to: string): Plugin {
  return {
    name: 'ogdb-rename-html-output',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist-app')
      const src = path.join(outDir, from)
      const dst = path.join(outDir, to)
      if (fs.existsSync(src)) fs.renameSync(src, dst)
    },
  }
}

// Mirrors the H1 fix from vite.config.ts: `@neo4j-cypher/react-codemirror`
// loads its lint worker at runtime via `new URL('./lintWorker.mjs',
// import.meta.url)`, but Vite's dep-prebundle directory doesn't get the
// sibling worker copied in. Serve it ourselves from node_modules.
function cypherLintWorkerMiddleware(): Plugin {
  return {
    name: 'ogdb-cypher-lint-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        if (!req.url.endsWith('/lintWorker.mjs')) return next()
        const candidates = [
          path.resolve(
            __dirname,
            'node_modules/@neo4j-cypher/react-codemirror/dist/src/lang-cypher/lintWorker.mjs',
          ),
          path.resolve(
            __dirname,
            'node_modules/@neo4j-cypher/lint-worker/dist/esm/lintWorker.mjs',
          ),
        ]
        const hit = candidates.find((p) => fs.existsSync(p))
        if (!hit) return next()
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript')
        fs.createReadStream(hit).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    cypherLintWorkerMiddleware(),
    renameHtmlOutput('index-app.html', 'index.html'),
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
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  // EVAL-FRONTEND-QUALITY-CYCLE2.md H-8: `@loaders.gl/worker-utils` reaches
  // for `node:child_process` at parse time. Keeping it out of dep-prebundle
  // prevents Vite from chasing the Node-side `spawn` import into the SPA
  // graph. The deck.gl runtime is still bundled — only the prebundle step
  // is excluded.
  optimizeDeps: {
    exclude: ['@loaders.gl/worker-utils'],
  },
  build: {
    outDir: 'dist-app',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: path.resolve(__dirname, 'index-app.html'),
      output: {
        // NOTE: @neo4j-cypher/react-codemirror is dynamically imported by
        // CypherEditorPanel (H1 — defer-load until first editor interaction)
        // so the editor itself stays in its own code-split chunk. The
        // shared cypher language-support package (the actual grammar) is
        // pulled into a `cypher-grammar-vendor` chunk so the editor and
        // the lintWorker can both link against it instead of duplicating
        // ~8 MB of grammar — EVAL-FRONTEND-QUALITY-CYCLE2.md H-2.
        //
        // deck.gl + maplibre are kept in their own vendor chunks so the
        // playground cold load doesn't pay for them when no geo layout
        // is active (paired with the H-5 lazy import of GeoCanvas).
        manualChunks(id) {
          if (id.includes('node_modules/@neo4j-cypher/language-support')) {
            return 'cypher-grammar-vendor'
          }
          if (id.includes('node_modules/@neo4j-cypher/cypher-antlr-grammar')) {
            return 'cypher-grammar-vendor'
          }
          if (id.includes('node_modules/maplibre-gl')) {
            return 'maplibre-vendor'
          }
          if (id.includes('node_modules/@deck.gl') || id.includes('node_modules/@loaders.gl')) {
            return 'deckgl-vendor'
          }
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/react-force-graph-2d')) {
            return 'graph-vendor'
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion-vendor'
          }
          if (id.includes('node_modules/@tanstack/')) {
            return 'tanstack-vendor'
          }
          if (id.includes('node_modules/zustand')) {
            return 'state-vendor'
          }
          return undefined
        },
      },
    },
  },
})
