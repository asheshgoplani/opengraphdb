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
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
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
        // so it's left out of manualChunks here; rollup creates a code-split
        // chunk for it automatically and the 8.3 MB lint worker stays out of
        // the cold playground bundle.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'graph-vendor': ['react-force-graph-2d'],
          'motion-vendor': ['framer-motion'],
          'tanstack-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
          'state-vendor': ['zustand'],
        },
      },
    },
  },
})
