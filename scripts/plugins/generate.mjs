#!/usr/bin/env node
// Writes the plugin registrations for the worker, backend and frontend from viberglass.plugins.json,
// and makes each app depend on exactly the configured plugin packages.
//
//   npm run generate:plugins     (then npm install if a dependency changed)

import fs from "node:fs";
import path from "node:path";
import { readPlugins, WORKSPACE_ROOT } from "./pluginConfig.mjs";

const HEADER = "// Generated from viberglass.plugins.json by `npm run generate:plugins`. Do not edit.";

const TARGETS = [
  {
    kind: "agents",
    appDir: "apps/viberator",
    file: "src/agents/configuredAgentPlugins.ts",
    exportName: "configuredAgentPlugins",
    pluginType: "AgentPlugin",
    typeModule: "@viberglass/agent-core",
    entry: "",
    style: { quote: '"', semi: ";" },
    dependencyPrefix: "@viberglass/agent-",
    nonPluginDependencies: ["@viberglass/agent-core"],
  },
  {
    kind: "integrations",
    appDir: "apps/platform-backend",
    file: "src/integrations/configuredIntegrationPlugins.ts",
    exportName: "configuredIntegrationPlugins",
    pluginType: "IntegrationPlugin",
    typeModule: "@viberglass/integration-core",
    entry: "",
    style: { quote: '"', semi: ";" },
    dependencyPrefix: "@viberglass/integration-",
    nonPluginDependencies: ["@viberglass/integration-core"],
  },
  {
    kind: "integrations",
    appDir: "apps/platform-frontend",
    file: "src/integrations/configuredFrontendIntegrationPlugins.ts",
    exportName: "configuredFrontendIntegrationPlugins",
    pluginType: "IntegrationFrontendPlugin",
    typeModule: "@viberglass/integration-core/frontend",
    entry: "/frontend",
    style: { quote: "'", semi: "" },
    dependencyPrefix: "@viberglass/integration-",
    nonPluginDependencies: ["@viberglass/integration-core"],
  },
];

for (const target of TARGETS) {
  const plugins = readPlugins(target.kind);
  writeRegistrations(target, plugins);
  syncDependencies(target, plugins);
}

function writeRegistrations(target, plugins) {
  const { quote: q, semi } = target.style;
  const identifiers = plugins.map((plugin) => identifierFor(plugin.name, target.entry));
  const lines = [
    HEADER,
    `import type { ${target.pluginType} } from ${q}${target.typeModule}${q}${semi}`,
    ...plugins.map((plugin, i) => `import ${identifiers[i]} from ${q}${plugin.name}${target.entry}${q}${semi}`),
    "",
    `export const ${target.exportName}: readonly ${target.pluginType}[] = [`,
    ...identifiers.map((identifier) => `  ${identifier},`),
    `]${semi}`,
    "",
  ];
  const filePath = path.join(WORKSPACE_ROOT, target.appDir, target.file);
  writeIfChanged(filePath, lines.join("\n"));
}

function syncDependencies(target, plugins) {
  const manifestPath = path.join(WORKSPACE_ROOT, target.appDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const kept = Object.entries(manifest.dependencies ?? {}).filter(
    ([name]) => !name.startsWith(target.dependencyPrefix) || target.nonPluginDependencies.includes(name),
  );
  const configured = plugins.map((plugin) => [plugin.name, "*"]);
  manifest.dependencies = Object.fromEntries(
    [...kept, ...configured].sort(([a], [b]) => a.localeCompare(b)),
  );
  writeIfChanged(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

/** "@viberglass/integration-github" with "/frontend" -> "integrationGithubFrontend" */
function identifierFor(packageName, entry) {
  const words = `${packageName.replace(/^@[^/]+\//, "")}${entry}`.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return words.map((word, i) => (i === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("");
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) return;
  fs.writeFileSync(filePath, content);
  console.log(`Wrote ${path.relative(WORKSPACE_ROOT, filePath)}`);
}
