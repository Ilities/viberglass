#!/usr/bin/env node
// Prints "<variant> <package dir>" for each configured harness whose worker Dockerfile is composed
// from its Dockerfile.fragment. Reads the built plugins, so run `npm run build` first.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { readPlugins, WORKSPACE_ROOT } from "./pluginConfig.mjs";

const require = createRequire(import.meta.url);

for (const { name, dir } of readPlugins("agents")) {
  const distPath = path.join(WORKSPACE_ROOT, dir, "dist/index.js");
  if (!fs.existsSync(distPath)) {
    throw new Error(`${name} isn't built (${distPath} is missing). Run "npm run build" first.`);
  }
  const mod = require(distPath);
  const docker = (mod.default ?? mod).docker;
  if (!docker) throw new Error(`${name} has no docker descriptor.`);
  // A plugin naming its own Dockerfile uses a hand-written one instead of a composed one.
  if (docker.dockerfilePath) continue;
  console.log(`${docker.variant} ${dir}`);
}
