import { defineConfig } from 'tsup'

export default defineConfig([
  {
    // Each build cleans only its own folder; a shared dist/ lets one build delete the other's types.
    entry: { index: 'src/backend/index.ts' },
    outDir: 'dist/backend',
    format: ['cjs', 'esm'],
    dts: { compilerOptions: { skipLibCheck: true } },
    clean: true,
    splitting: false,
    external: ['@viberglass/types', '@viberglass/integration-core'],
  },
  {
    entry: { index: 'src/frontend/index.ts' },
    outDir: 'dist/frontend',
    clean: true,
    format: ['esm'],
    dts: { compilerOptions: { skipLibCheck: true } },
    splitting: false,
    jsx: 'react-jsx',
    external: ['react', 'react-dom', '@radix-ui/themes', '@radix-ui/react-icons', 'react-router-dom', 'sonner', '@viberglass/types', '@viberglass/integration-core', '@viberglass/platform-ui'],
  },
])
