import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  clean: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
  external: ['@modelcontextprotocol/sdk'],
})
