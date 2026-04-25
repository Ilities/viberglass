import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: { compilerOptions: { skipLibCheck: true } },
  clean: true,
  splitting: false,
  jsx: 'react-jsx',
  external: ['react', 'react-dom', '@radix-ui/themes', 'react-router-dom', 'clsx'],
})
