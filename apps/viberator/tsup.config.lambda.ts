import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "lambda-handler": "src/workers/entrypoints/lambda-handler.ts",
  },
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  clean: true,
  shims: true,
  sourcemap: true,
  dts: true, // Generate .d.ts files
  splitting: false,
  treeshake: true,
  minify: false, // Set to true for production
});
