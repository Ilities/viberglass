#!/usr/bin/env node
/**
 * Generates packages/types/src/workerImageCatalog.json from agent plugin metadata.
 *
 * Run after building all agent packages:
 *   npm run generate:catalog
 *
 * CI check: run this, then verify workerImageCatalog.json is unchanged (git diff --exit-code).
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

interface PluginDockerMeta {
  variant: string;
  repositoryName: string;
  scriptImageName: string;
  supportedAgents: string[];
  defaultForAgents: string[];
  isAgentImage?: boolean;
  dockerfilePath?: string;
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

/** Load a plugin's docker metadata from its built CJS dist. */
function loadPluginDocker(packageDirName: string): PluginDockerMeta {
  const distPath = path.join(
    WORKSPACE_ROOT,
    "packages/agents",
    packageDirName,
    "dist/index.js",
  );
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
  return plugin.docker as PluginDockerMeta;
}

// All agent plugin packages (order only affects multi-agent supportedAgents sort)
const PLUGIN_PACKAGES = [
  "agent-claude-code",
  "agent-codex",
  "agent-gemini",
  "agent-kimi",
  "agent-mistral-vibe",
  "agent-opencode",
  "agent-pi",
  "agent-qwen",
];

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
    includeInHarnessSetup: true,
    includeInInfraProvisioning: true,
    includeInBuildScript: true,
    includeInPushScript: true,
    isAgentImage,
    supportedAgents: docker.supportedAgents,
    defaultForAgents: docker.defaultForAgents,
  };
}

// Load all plugins
const plugins = PLUGIN_PACKAGES.map(loadPluginDocker);

// All agent IDs for the multi-agent image (sorted for determinism)
const allAgentIds = plugins
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
