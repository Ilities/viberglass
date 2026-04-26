import { build, type BuildOptions } from "esbuild";
import { resolve } from "path";

const rootDir = process.cwd();

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
    entryPoints: [resolve(rootDir, backgroundScript)],
    outfile: resolve(rootDir, "dist/background.js"),
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
      entryPoints: [resolve(rootDir, script)],
      outfile: resolve(rootDir, "dist/content", name),
      format: "iife",
      minify: true,
    });
    console.log(`Built content/${name}`);
  }
}
