import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
