import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { 'backend/index': 'src/backend/index.ts' },
    format: ['cjs', 'esm'],
    dts: { compilerOptions: { skipLibCheck: true } },
    clean: true,
    splitting: false,
    external: ['@viberglass/types'],
  },
  {
    entry: { 'frontend/index': 'src/frontend/index.ts' },
    format: ['esm'],
    dts: { compilerOptions: { skipLibCheck: true } },
    splitting: false,
    jsx: 'react-jsx',
    external: ['react', 'react-dom', '@radix-ui/themes', '@radix-ui/react-icons', 'react-router-dom', 'sonner', '@viberglass/types', '@viberglass/platform-ui'],
  },
])
