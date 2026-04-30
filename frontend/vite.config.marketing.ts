import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
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

export default defineConfig({
  plugins: [react(), renameHtmlOutput('index-marketing.html', 'index.html')],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-marketing',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index-marketing.html'),
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'motion-vendor': ['framer-motion'],
        },
      },
    },
  },
})
