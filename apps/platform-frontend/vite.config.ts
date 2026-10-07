import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // The e2e suite runs a second Vite beside the dev container, which owns the default cache.
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      // The shared types load from source, so changing them never needs a build first.
      { find: /^@viberglass\/types$/, replacement: path.resolve(__dirname, '../../packages/types/src/index.ts') },
    ],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
})
