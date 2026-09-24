import {
  NoopAgentEndpointEnvironment,
  type AgentEndpointEnvironment,
  type AgentPlugin,
  type IAgentGitService,
} from "@viberglass/agent-core";
import type { KimiCodeConfig } from "./config";
import { KimiAgentEndpointEnvironment } from "./KimiAgentEndpointEnvironment";
import { KimiCodeAgent } from "./KimiCodeAgent";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** The runner's `agent.endpoint` / `agent.model` (v1 config), e.g. Moonshot's platform API instead of Kimi Code. */
function resolveKimiSettings(clankerConfig?: Record<string, unknown>): { endpoint?: string; model?: string } {
  if (!clankerConfig) return {};
  const deploymentConfig = isObjectRecord(clankerConfig.deploymentConfig)
    ? clankerConfig.deploymentConfig
    : clankerConfig;
  const agent = isObjectRecord(deploymentConfig.agent) ? deploymentConfig.agent : undefined;
  if (deploymentConfig.version !== 1 || agent?.type !== "kimi-code") return {};
  return { endpoint: toNonEmptyString(agent.endpoint), model: toNonEmptyString(agent.model) };
}

const kimiCodePlugin: AgentPlugin<KimiCodeConfig> = {
  id: "kimi-code",
  displayName: "Kimi Code",

  create(config, logger, gitService?: IAgentGitService) {
    return new KimiCodeAgent(config, logger, gitService);
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
    costPerExecution: 0.45,
    averageSuccessRate: 0.83,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    // No model here: KimiCodeAgent defaults to Kimi Code's model, and a runner can set one.
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
    endpoint: ["KIMI_BASE_URL", "KIMI_CODE_ENDPOINT", "MOONSHOT_BASE_URL"],
  },

  stateDir: ".kimi",

  endpointEnvironment(ctx): AgentEndpointEnvironment {
    const settings = resolveKimiSettings(ctx.clankerConfig);
    if (!settings.endpoint && !settings.model) {
      return new NoopAgentEndpointEnvironment();
    }
    return new KimiAgentEndpointEnvironment(settings);
  },

  providers: [
    { provider: "kimi-code", envVar: "KIMI_API_KEY", default: true },
    {
      provider: "moonshotai",
      envVar: "MOONSHOT_API_KEY",
      default: true,
      endpoint: "https://api.moonshot.ai/v1",
      model: "kimi-k3",
    },
  ],

  docker: {
    variant: "kimi",
    repositoryName: "viberator-worker-kimi",
    scriptImageName: "worker-kimi",
    supportedAgents: ["kimi-code"],
    defaultForAgents: ["kimi-code"],
  },
};

export default kimiCodePlugin;
