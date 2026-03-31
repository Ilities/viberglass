import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "api/server": "src/api/server.ts" },
  format: ["esm"],
  outDir: "dist",
  clean: true,
  sourcemap: true,
  target: "node20",
  // Externalize all node_modules (direct and transitive) — keeps only our source in the bundle.
  // Relative imports (starting with ".") are still bundled together.
  external: [/^[^.]/],
});
