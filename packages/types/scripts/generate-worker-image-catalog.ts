#!/usr/bin/env node
/**
 * Generates packages/types/src/workerImageCatalog.json,
 * packages/types/src/agentProviderCatalog.json and
 * packages/types/src/agentPluginCatalog.json from the metadata of the harnesses
 * in viberglass.plugins.json.
 *
 * Run after building all agent packages:
 *   npm run generate:catalog
 *
 * CI check: run this, then verify the JSON files are unchanged (git diff --exit-code).
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { MODEL_PROVIDERS } from "../src/modelProviders";
import { readPlugins, WORKSPACE_ROOT } from "../../../scripts/plugins/pluginConfig.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface PluginDockerMeta {
  variant: string;
  repositoryName: string;
  scriptImageName: string;
  supportedAgents: string[];
  defaultForAgents: string[];
  isAgentImage?: boolean;
  dockerfilePath?: string;
  testOnly?: boolean;
}

interface PluginProviderBinding {
  provider: string;
  envVar: string;
  default?: boolean;
  model?: string;
  endpoint?: string;
}

interface PluginEnvAliases {
  apiKey?: string[];
  endpoint?: string[];
}

interface LoadedPlugin {
  id: string;
  docker: PluginDockerMeta;
  providers: PluginProviderBinding[];
  envAliases: PluginEnvAliases;
  harnessConfigPatterns: string[];
  modelApiFormats: string[];
}

interface CatalogEntry {
  variant: string;
  repositoryName: string;
  scriptImageName: string;
  dockerfilePath: string;
  includeInHarnessSetup: boolean;
  includeInInfraProvisioning: boolean;
  includeInBuildScript: boolean;
  includeInPushScript: boolean;
  isAgentImage: boolean;
  supportedAgents: string[];
  defaultForAgents: string[];
}

/** Load a plugin's catalog metadata from its built CJS dist. */
function loadPlugin(packageDir: string): LoadedPlugin {
  const distPath = path.join(WORKSPACE_ROOT, packageDir, "dist/index.js");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Built dist not found: ${distPath}\n` +
        `Run "npm run build" before generating the catalog.`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(distPath);
  const plugin = mod.default ?? mod;
  if (!plugin?.docker) {
    throw new Error(`Plugin at ${distPath} has no docker descriptor`);
  }
  return {
    id: plugin.id as string,
    docker: plugin.docker as PluginDockerMeta,
    providers: (plugin.providers ?? []) as PluginProviderBinding[],
    envAliases: (plugin.envAliases ?? {}) as PluginEnvAliases,
    harnessConfigPatterns: (plugin.harnessConfigPatterns ?? []) as string[],
    modelApiFormats: (plugin.customEndpoints?.apiFormats ?? []).filter((value: unknown): value is string => typeof value === "string"),
  };
}

function buildAgentEntry(docker: PluginDockerMeta): CatalogEntry {
  const isAgentImage = docker.isAgentImage !== false;
  const dockerfilePath =
    docker.dockerfilePath ??
    `infra/workers/docker/generated/${docker.variant}.Dockerfile`;
  return {
    variant: docker.variant,
    repositoryName: docker.repositoryName,
    scriptImageName: docker.scriptImageName,
    dockerfilePath,
    includeInHarnessSetup: !docker.testOnly,
    includeInInfraProvisioning: !docker.testOnly,
    includeInBuildScript: true,
    includeInPushScript: !docker.testOnly,
    isAgentImage,
    supportedAgents: docker.supportedAgents,
    defaultForAgents: docker.defaultForAgents,
  };
}

// Load the configured plugins
const loadedPlugins = readPlugins("agents").map((plugin) => loadPlugin(plugin.dir));
const plugins = loadedPlugins.map((p) => p.docker);

// All agent IDs for the multi-agent image (sorted for determinism)
const allAgentIds = plugins
  .filter((p) => !p.testOnly)
  .flatMap((p) => p.supportedAgents)
  .sort();

// Static infrastructure entries that don't correspond to a single plugin
const STATIC_ENTRIES: CatalogEntry[] = [
  {
    variant: "base",
    repositoryName: "viberator-base-worker",
    scriptImageName: "base-worker",
    dockerfilePath: "infra/workers/docker/base/base-worker.Dockerfile",
    includeInHarnessSetup: true,
    includeInInfraProvisioning: true,
    includeInBuildScript: true,
    includeInPushScript: true,
    isAgentImage: false,
    supportedAgents: [],
    defaultForAgents: [],
  },
  {
    variant: "ecs",
    repositoryName: "viberator-ecs-worker",
    scriptImageName: "ecs-worker",
    dockerfilePath: "infra/workers/docker/viberator-ecs-worker.Dockerfile",
    includeInHarnessSetup: false,
    includeInInfraProvisioning: false,
    includeInBuildScript: true,
    includeInPushScript: true,
    isAgentImage: false,
    supportedAgents: [],
    defaultForAgents: [],
  },
  {
    variant: "lambda",
    repositoryName: "viberator-lambda-worker",
    scriptImageName: "lambda-worker",
    dockerfilePath: "infra/workers/docker/viberator-lambda.Dockerfile",
    includeInHarnessSetup: true,
    includeInInfraProvisioning: true,
    includeInBuildScript: true,
    includeInPushScript: true,
    isAgentImage: false,
    supportedAgents: [],
    defaultForAgents: [],
  },
  {
    variant: "multi-agent",
    repositoryName: "viberator-worker-multi-agent",
    scriptImageName: "worker-multi-agent",
    dockerfilePath:
      "infra/workers/docker/viberator-worker-multi-agent.Dockerfile",
    includeInHarnessSetup: true,
    includeInInfraProvisioning: true,
    includeInBuildScript: true,
    includeInPushScript: true,
    isAgentImage: false,
    // Multi-agent image supports all known agents
    supportedAgents: allAgentIds,
    // claude-code is the default agent for the multi-agent image
    defaultForAgents: ["claude-code"],
  },
];

// Build per-plugin entries and sort by variant for determinism
const agentEntries = plugins.map(buildAgentEntry);
agentEntries.sort((a, b) => a.variant.localeCompare(b.variant));

// Final catalog: static entries first (their order matters for tooling), then agents
const catalog: CatalogEntry[] = [...STATIC_ENTRIES, ...agentEntries];

const outputPath = path.join(
  __dirname,
  "..",
  "src",
  "workerImageCatalog.json",
);
fs.writeFileSync(outputPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `Generated workerImageCatalog.json with ${catalog.length} entries`,
);

// Provider bindings: which harness runs which provider's keys.
const knownProviders = new Set<string>(MODEL_PROVIDERS.map((p) => p.id));
// Test-only plugins bind the test-only provider, so they're included here.
const providerBindings = loadedPlugins
  .flatMap((p) =>
    p.providers.map((binding) => {
      if (!knownProviders.has(binding.provider)) {
        throw new Error(
          `Plugin '${p.id}' binds unknown provider '${binding.provider}'. Add it to MODEL_PROVIDERS in packages/types/src/modelProviders.ts.`,
        );
      }
      return {
        agent: p.id,
        provider: binding.provider,
        envVar: binding.envVar,
        default: binding.default === true,
        ...(binding.model ? { model: binding.model } : {}),
        ...(binding.endpoint ? { endpoint: binding.endpoint } : {}),
      };
    }),
  )
  .sort((a, b) => a.provider.localeCompare(b.provider) || a.agent.localeCompare(b.agent));

// A provider none of the configured harnesses runs isn't offered by this build.
for (const providerId of knownProviders) {
  const bindings = providerBindings.filter((b) => b.provider === providerId);
  const defaults = bindings.filter((b) => b.default);
  if (bindings.length > 0 && defaults.length !== 1) {
    throw new Error(
      `Provider '${providerId}' needs exactly one default harness, found ${defaults.length}: ${defaults.map((d) => d.agent).join(", ") || "none"}.`,
    );
  }
}

fs.writeFileSync(
  path.join(__dirname, "..", "src", "agentProviderCatalog.json"),
  JSON.stringify(providerBindings, null, 2) + "\n",
);
console.log(
  `Generated agentProviderCatalog.json with ${providerBindings.length} bindings`,
);

// Per harness: env var names it reads its key and endpoint from, and config files it accepts.
const agentPlugins = loadedPlugins
  .map((p) => ({
    agent: p.id,
    apiKey: p.envAliases.apiKey ?? [],
    endpoint: p.envAliases.endpoint ?? [],
    harnessConfigFiles: p.harnessConfigPatterns,
    modelApiFormats: p.modelApiFormats,
  }))
  .sort((a, b) => a.agent.localeCompare(b.agent));

fs.writeFileSync(
  path.join(__dirname, "..", "src", "agentPluginCatalog.json"),
  JSON.stringify(agentPlugins, null, 2) + "\n",
);
console.log(`Generated agentPluginCatalog.json with ${agentPlugins.length} agents`);
