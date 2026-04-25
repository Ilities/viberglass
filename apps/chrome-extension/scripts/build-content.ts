import { build, type BuildOptions } from "esbuild";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const contentScripts = [
  "src/content/area-selector.ts",
  "src/content/element-selector.ts",
  "src/content/annotator.ts",
  "src/content/context-collector.ts",
];

const backgroundScript = "src/background/service-worker.ts";

const sharedOptions: Omit<BuildOptions, "outdir" | "outfile"> = {
  bundle: true,
  target: "chrome120",
  platform: "browser",
  sourcemap: false,
};

async function buildBackground() {
  await build({
    ...sharedOptions,
    entryPoints: [resolve(__dirname, "..", backgroundScript)],
    outfile: resolve(__dirname, "../dist/background.js"),
    format: "esm",
    minify: false,
  });
  console.log("Built background.js");
}

async function buildContentScripts() {
  for (const script of contentScripts) {
    const name = script.split("/").pop()!.replace(".ts", ".js");
    await build({
      ...sharedOptions,
      entryPoints: [resolve(__dirname, "..", script)],
      outfile: resolve(__dirname, "../dist/content", name),
      format: "iife",
      minify: true,
    });
    console.log(`Built content/${name}`);
  }
}

async function main() {
  await Promise.all([buildBackground(), buildContentScripts()]);
  console.log("Content scripts and background built successfully");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
