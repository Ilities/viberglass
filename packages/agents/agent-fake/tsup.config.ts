import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/fakeAcpServerMain.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  // FakeAgent locates fakeAcpServerMain.js next to itself via __dirname.
  shims: true,
})
