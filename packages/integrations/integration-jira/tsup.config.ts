import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'backend/index': 'src/backend/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    external: ['@viberglass/types', '@viberglass/integration-core'],
  },
  {
    entry: { 'frontend/index': 'src/frontend/index.ts' },
    format: ['esm'],
    dts: true,
    splitting: false,
    jsx: 'react-jsx',
    external: ['react', 'react-dom', '@radix-ui/themes', 'react-router-dom', '@viberglass/types', '@viberglass/integration-core', '@viberglass/platform-ui'],
  },
])
