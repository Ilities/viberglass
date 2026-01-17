import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bullmq-worker": "src/workers/bullmq-handler.ts",
    "lambda-handler": "src/workers/lambda-handler.ts",
    "api-server": "src/api-server.ts",
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
