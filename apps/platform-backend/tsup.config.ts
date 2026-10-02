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
  // Server bundle — @viberglass/* inlined so production image needs no workspace symlinks;
  // all other node_modules kept external so CJS packages aren't double-bundled into ESM
  {
    entry: { "api/server": "src/api/server.ts" },
    format: ["esm"],
    outDir: "dist",
    clean: true,
    sourcemap: true,
    target: "node20",
    external: [/^[^.]/],
    noExternal: [/@viberglass\/.*/],
  },
  // Migration files — one file each so FileMigrationProvider can load them. Like the server,
  // they inline @viberglass/*: the production image has no workspace packages in node_modules.
  {
    entry: migrationEntries,
    format: ["esm"],
    outDir: "dist",
    splitting: false,
    sourcemap: true,
    target: "node20",
    external: [/^[^.]/],
    noExternal: [/@viberglass\/.*/],
  },
]);
