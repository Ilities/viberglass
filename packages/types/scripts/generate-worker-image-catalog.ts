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
import { readSignInMethods, type AgentSignInMethod } from "../src/agentSignIn";
import {
  readHarnessConfigEditor,
  readSettingFields,
  type AgentSettingField,
  type HarnessConfigEditor,
} from "../src/agentSettings";
import { assertSettingRenderable } from "./settingFormCheck";
import { readDefaultAgent, readPlugins, WORKSPACE_ROOT } from "../../../scripts/plugins/pluginConfig.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface PluginDockerMeta {
  variant: string;
  repositoryName: string;
  scriptImageName: string;
  supportedAgents: string[];
  defaultForAgents: string[];
  dockerfilePath?: string;
  testOnly?: boolean;
  lambdaUnsupportedReason?: string;
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
  packageName: string;
  packageDir: string;
  id: string;
  label: string;
  description: string;
  logo?: string;
  testOnly: boolean;
  endpointRank?: number;
  docker: PluginDockerMeta;
  providers: PluginProviderBinding[];
  envAliases: PluginEnvAliases;
  harnessConfigPatterns: string[];
  modelApiFormats: string[];
  settings: AgentSettingField[];
  harnessConfigEditor: HarnessConfigEditor | null;
  signInMethods: AgentSignInMethod[];
  rejectedKeyNote?: string;
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
function loadPlugin(packageName: string, packageDir: string): LoadedPlugin {
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
  for (const field of ["label", "description"]) {
    if (typeof plugin[field] !== "string" || plugin[field].trim() === "") {
      throw new Error(`Plugin ${packageName} needs a ${field}.`);
    }
  }
  const harnessConfigPatterns = (plugin.harnessConfigPatterns ?? []) as string[];
  return {
    packageName,
    packageDir,
    id: plugin.id as string,
    label: plugin.label as string,
    description: plugin.description as string,
    logo: plugin.logo as string | undefined,
    testOnly: plugin.docker.testOnly === true,
    endpointRank: plugin.customEndpoints?.rank as number | undefined,
    docker: plugin.docker as PluginDockerMeta,
    providers: (plugin.providers ?? []) as PluginProviderBinding[],
    envAliases: (plugin.envAliases ?? {}) as PluginEnvAliases,
    harnessConfigPatterns,
    modelApiFormats: (plugin.customEndpoints?.apiFormats ?? []).filter((value: unknown): value is string => typeof value === "string"),
    settings: checkedSettings(packageName, plugin.settings),
    harnessConfigEditor: checkedHarnessConfigEditor(packageName, plugin.harnessConfigEditor, harnessConfigPatterns),
    signInMethods: checkedSignInMethods(packageName, plugin.signInMethods),
    rejectedKeyNote: typeof plugin.rejectedKeyNote === "string" ? plugin.rejectedKeyNote : undefined,
  };
}

function checkedSignInMethods(packageName: string, raw: unknown): AgentSignInMethod[] {
  if (raw === undefined) return [];
  const methods = readSignInMethods(raw);
  if (!Array.isArray(raw) || methods.length !== raw.length) {
    throw new Error(`Plugin ${packageName} has a malformed sign-in method: each needs an id, a label, kind "device_code" and credentialEnvVar.`);
  }
  if (new Set(methods.map((method) => method.id)).size !== methods.length) {
    throw new Error(`Plugin ${packageName} declares a sign-in method id twice.`);
  }
  return methods;
}

// Keys the agent config already uses for something else.
const RESERVED_SETTING_KEYS = new Set(["type", "signIn"]);

function checkedSettings(packageName: string, raw: unknown): AgentSettingField[] {
  if (raw === undefined) return [];
  const settings = readSettingFields(raw);
  if (!Array.isArray(raw) || settings.length !== raw.length) {
    throw new Error(`Plugin ${packageName} has a malformed setting: each needs a key, a label, a type of string or select, and env.`);
  }
  const keys = new Set<string>();
  settings.forEach((setting, index) => {
    if (RESERVED_SETTING_KEYS.has(setting.key) || keys.has(setting.key)) {
      throw new Error(`Plugin ${packageName} can't use the setting key '${setting.key}': it's reserved or used twice.`);
    }
    keys.add(setting.key);
    assertSettingRenderable(packageName, setting, raw[index]);
  });
  return settings;
}

function checkedHarnessConfigEditor(packageName: string, raw: unknown, patterns: string[]): HarnessConfigEditor | null {
  if (raw === undefined) return null;
  const editor = readHarnessConfigEditor(raw);
  if (!editor || !patterns.includes(editor.fileType) || editor.envReferences.some((reference) => !reference.includes("NAME"))) {
    throw new Error(
      `Plugin ${packageName} has a malformed harnessConfigEditor: its fileType must be one of its harnessConfigPatterns, and each envReference must contain NAME.`,
    );
  }
  return editor;
}

function buildAgentEntry(docker: PluginDockerMeta): CatalogEntry {
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
    // Built FROM the base worker image.
    isAgentImage: true,
    supportedAgents: docker.supportedAgents,
    defaultForAgents: docker.defaultForAgents,
  };
}

// Load the configured plugins
const loadedPlugins = readPlugins("agents").map((plugin) => loadPlugin(plugin.name, plugin.dir));
const defaultAgentPackage = readDefaultAgent();
const defaultAgent = loadedPlugins.find((p) => p.packageName === defaultAgentPackage);
if (!defaultAgent) throw new Error(`Default agent ${defaultAgentPackage} isn't among the configured agents.`);
const defaultAgentId = defaultAgent.id;
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
    defaultForAgents: [defaultAgentId],
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

// Logos are served by the frontend; the folder holds only the configured harnesses' logos.
const LOGO_DIR = path.join(WORKSPACE_ROOT, "apps/platform-frontend/public/logos/agents");
fs.rmSync(LOGO_DIR, { recursive: true, force: true });
fs.mkdirSync(LOGO_DIR, { recursive: true });
function publishLogo(p: LoadedPlugin): string | null {
  if (!p.logo) return null;
  const fileName = `${p.id}${path.extname(p.logo)}`;
  fs.copyFileSync(path.join(WORKSPACE_ROOT, p.packageDir, p.logo), path.join(LOGO_DIR, fileName));
  return `/logos/agents/${fileName}`;
}

// Per harness, in config order (the order the runner form offers them): what the platform
// shows, the env var names it reads its key and endpoint from, the config files it accepts, its settings and its sign-ins.
const agentPlugins = loadedPlugins.map((p) => ({
  agent: p.id,
  label: p.label,
  description: p.description,
  logo: publishLogo(p),
  default: p.id === defaultAgentId,
  testOnly: p.testOnly,
  endpointRank: p.endpointRank ?? null,
  apiKey: p.envAliases.apiKey ?? [],
  endpoint: p.envAliases.endpoint ?? [],
  harnessConfigFiles: p.harnessConfigPatterns,
  modelApiFormats: p.modelApiFormats,
  settings: p.settings,
  harnessConfigEditor: p.harnessConfigEditor,
  signInMethods: p.signInMethods,
  lambdaUnsupportedReason: p.docker.lambdaUnsupportedReason ?? null,
  rejectedKeyNote: p.rejectedKeyNote ?? null,
}));

fs.writeFileSync(
  path.join(__dirname, "..", "src", "agentPluginCatalog.json"),
  JSON.stringify(agentPlugins, null, 2) + "\n",
);
console.log(`Generated agentPluginCatalog.json with ${agentPlugins.length} agents`);
