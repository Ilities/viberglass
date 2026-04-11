import type { AgentPlugin, AgentEndpointEnvironment, IAgentGitService } from "@viberglass/agent-core";
import { NoopAgentEndpointEnvironment } from "@viberglass/agent-core";
import type { OpenCodeConfig } from "./config";
import { OpenCodeAgent } from "./OpenCodeAgent";
import { OpenCodeAgentEndpointEnvironment } from "./OpenCodeAgentEndpointEnvironment";
import * as fs from "fs";
import * as path from "path";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveDeploymentConfig(
  clankerConfig?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!clankerConfig) return undefined;
  if (isObjectRecord(clankerConfig.deploymentConfig)) return clankerConfig.deploymentConfig;
  return clankerConfig;
}

function resolveOpenCodeSettings(
  clankerConfig?: Record<string, unknown>,
): { endpoint?: string; model?: string } {
  const deploymentConfig = resolveDeploymentConfig(clankerConfig);
  if (!deploymentConfig) return {};

  const deploymentAgent = isObjectRecord(deploymentConfig.agent)
    ? deploymentConfig.agent
    : undefined;

  if (deploymentConfig.version === 1) {
    if (deploymentAgent?.type !== "opencode") return {};
    return {
      endpoint: toNonEmptyString(deploymentAgent.endpoint),
      model: toNonEmptyString(deploymentAgent.model),
    };
  }

  const configuredAgent =
    toNonEmptyString(clankerConfig?.agent as string) ||
    toNonEmptyString(deploymentConfig.agent as string);
  if (configuredAgent !== "opencode") return {};

  return {
    endpoint: toNonEmptyString(deploymentConfig.endpoint),
    model: toNonEmptyString(deploymentConfig.model),
  };
}

const openCodePlugin: AgentPlugin<OpenCodeConfig> = {
  id: "opencode",
  displayName: "OpenCode",

  create(config, logger, gitService?: IAgentGitService) {
    return new OpenCodeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [
      "python",
      "javascript",
      "typescript",
      "java",
      "go",
      "cpp",
      "rust",
    ],
    costPerExecution: 0.7,
    averageSuccessRate: 0.82,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["OPENCODE_API_KEY", "OPENAI_API_KEY"],
    endpoint: ["OPENCODE_BASE_URL", "OPENCODE_ENDPOINT", "OPENAI_BASE_URL"],
  },

  stateDir: ".opencode",

  harnessConfigPatterns: ["opencode.json"],

  materializeHarnessConfig: async ({ contents, homeDir }) => {
    const homeOpencodeDir = path.join(homeDir, ".opencode");
    const homeTargetPath = path.join(homeOpencodeDir, "opencode.json");
    await fs.promises.mkdir(homeOpencodeDir, { recursive: true });
    await fs.promises.writeFile(homeTargetPath, contents, "utf-8");
  },

  endpointEnvironment(ctx): AgentEndpointEnvironment {
    const settings = resolveOpenCodeSettings(ctx.clankerConfig);
    if (!settings.endpoint && !settings.model) {
      return new NoopAgentEndpointEnvironment();
    }
    return new OpenCodeAgentEndpointEnvironment(settings);
  },

  docker: {
    variant: "opencode",
    repositoryName: "viberator-worker-opencode",
    scriptImageName: "worker-opencode",
    supportedAgents: ["opencode"],
    defaultForAgents: ["opencode"],
  },
};

export default openCodePlugin;
