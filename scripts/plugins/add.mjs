#!/usr/bin/env node
// Adds a package to viberglass.plugins.json.
//
//   node scripts/plugins/add.mjs agents @viberglass/agent-aider

import fs from "node:fs";
import path from "node:path";
import { PLUGIN_KINDS, WORKSPACE_ROOT } from "./pluginConfig.mjs";

const [kind, name] = process.argv.slice(2);
if (!PLUGIN_KINDS.includes(kind) || !name) {
  console.error(`Usage: add.mjs <${PLUGIN_KINDS.join("|")}> <package name>`);
  process.exit(1);
}

const configPath = path.join(WORKSPACE_ROOT, "viberglass.plugins.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const names = config[kind] ?? [];
if (!names.includes(name)) {
  config[kind] = [...names, name];
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log(`Added ${name} to viberglass.plugins.json`);
}
