import { defineConfig } from "tsup";
import { globSync } from "fs";

const migrationEntries = Object.fromEntries(
  globSync("src/migrations/*.ts", { cwd: import.meta.dirname })
    .filter((f) => !f.endsWith("migrator.ts") && !f.endsWith(".d.ts"))
    .map((f) => {
      const name = f.replace(/^src\//, "").replace(/\.ts$/, "");
      return [name, f];
    }),
);

export default defineConfig([
  // Server bundle — all node_modules kept external so CJS packages aren't inlined into ESM
  {
    entry: { "api/server": "src/api/server.ts" },
    format: ["esm"],
    outDir: "dist",
    clean: true,
    sourcemap: true,
    target: "node20",
    external: [/^[^.]/],
  },
  // Migration files — transpiled individually (not bundled) so FileMigrationProvider can load them
  {
    entry: migrationEntries,
    format: ["esm"],
    outDir: "dist",
    bundle: false,
    sourcemap: true,
    target: "node20",
  },
]);
