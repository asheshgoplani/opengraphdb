import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// H1 (audit 2026-04-23b): `@neo4j-cypher/react-codemirror` loads its Cypher
// lint worker at runtime via
//   new URL('./lintWorker.mjs', import.meta.url).pathname
// After Vite dep-prebundles the package, `import.meta.url` resolves to
// `/node_modules/.vite/deps/` — but Vite does NOT copy the sibling
// `lintWorker.mjs` into that directory, so every dev-mode hit of the
// playground emits a 404 + breaks Cypher lint (codemirror logs a storm of
// "undefined MATCH" errors).
//
// Excluding the package from optimizeDeps fixes the URL but breaks its
// internal `prismjs` import (prismjs ships as CJS and needs Vite's interop
// shim that only fires during pre-bundling). So we keep pre-bundling on
// and instead serve the worker ourselves: a tiny middleware answers
// /node_modules/.vite/deps/lintWorker.mjs with the real file from
// `@neo4j-cypher/react-codemirror/dist/src/lang-cypher/lintWorker.mjs`.
function cypherLintWorkerMiddleware(): Plugin {
  return {
    name: 'ogdb-cypher-lint-worker',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        if (!req.url.endsWith('/lintWorker.mjs')) return next()
        // Match both /node_modules/.vite/deps/lintWorker.mjs (the canonical
        // 404 URL) and any similar sibling path cosmos/codemirror may ask
        // for — the worker is standalone and path-portable.
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
  plugins: [react(), cypherLintWorkerMiddleware()],
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
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'graph-vendor': ['react-force-graph-2d'],
          'cosmos-vendor': ['@cosmos.gl/graph'],
          'codemirror-vendor': ['@neo4j-cypher/react-codemirror'],
          'motion-vendor': ['framer-motion'],
          'tanstack-vendor': ['@tanstack/react-query', '@tanstack/react-table'],
          'state-vendor': ['zustand'],
        },
      },
    },
  },
})
