#!/usr/bin/env node
// Prints the configured packages of one kind for build scripts.
//
//   node scripts/plugins/list.mjs agents --workspace-args   -> -w @viberglass/agent-a -w @viberglass/agent-b
//   node scripts/plugins/list.mjs integrations --dirs       -> one package directory per line

import { readPlugins } from "./pluginConfig.mjs";

const [kind, format = "--workspace-args"] = process.argv.slice(2);
const plugins = readPlugins(kind);

if (format === "--workspace-args") {
  console.log(plugins.map((plugin) => `-w ${plugin.name}`).join(" "));
} else if (format === "--dirs") {
  for (const plugin of plugins) console.log(plugin.dir);
} else {
  console.error(`Unknown format '${format}'. Use --workspace-args or --dirs.`);
  process.exit(1);
}
