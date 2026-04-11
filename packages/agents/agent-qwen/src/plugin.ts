import type { AgentPlugin, AgentEndpointEnvironment, IAgentGitService } from "@viberglass/agent-core";
import { NoopAgentEndpointEnvironment } from "@viberglass/agent-core";
import type { QwenCodeConfig } from "./config";
import { QwenCodeAgent } from "./QwenCodeAgent";
import { QwenAgentEndpointEnvironment } from "./QwenAgentEndpointEnvironment";

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

function resolveQwenEndpoint(
  clankerConfig?: Record<string, unknown>,
): string | undefined {
  const deploymentConfig = resolveDeploymentConfig(clankerConfig);
  if (!deploymentConfig) return undefined;

  const deploymentAgent = isObjectRecord(deploymentConfig.agent)
    ? deploymentConfig.agent
    : undefined;

  if (deploymentConfig.version === 1) {
    if (deploymentAgent?.type !== "qwen-cli") return undefined;
    return toNonEmptyString(deploymentAgent.endpoint);
  }

  const configuredAgent =
    toNonEmptyString(clankerConfig?.agent as string) ||
    toNonEmptyString(deploymentConfig.agent as string);
  if (configuredAgent !== "qwen-cli") return undefined;

  return (
    toNonEmptyString(deploymentConfig.qwenEndpoint) ||
    toNonEmptyString(deploymentConfig.endpoint)
  );
}

const qwenCodePlugin: AgentPlugin<QwenCodeConfig> = {
  id: "qwen-cli",
  displayName: "Qwen Code CLI",

  create(config, logger, gitService?: IAgentGitService) {
    return new QwenCodeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: ["python", "javascript", "typescript", "java", "cpp"],
    costPerExecution: 0.3,
    averageSuccessRate: 0.78,
    executionTimeLimit: 2400,
    resourceLimits: {
      maxMemoryMB: 1536,
      maxCpuPercent: 70,
      maxDiskSpaceMB: 512,
      maxNetworkRequests: 80,
    },
    maxTokens: 3000,
    temperature: 0.2,
  },

  envAliases: {
    apiKey: ["QWEN_CLI_API_KEY"],
    endpoint: ["QWEN_API_ENDPOINT", "OPENAI_BASE_URL"],
  },

  stateDir: ".qwen",

  endpointEnvironment(ctx): AgentEndpointEnvironment {
    const endpoint = resolveQwenEndpoint(ctx.clankerConfig);
    if (!endpoint) {
      return new NoopAgentEndpointEnvironment();
    }
    return new QwenAgentEndpointEnvironment(endpoint);
  },

  docker: {
    variant: "qwen",
    repositoryName: "viberator-worker-qwen",
    scriptImageName: "worker-qwen",
    supportedAgents: ["qwen-cli"],
    defaultForAgents: ["qwen-cli"],
  },
};

export default qwenCodePlugin;
