import { ModelEndpointConfigEnvironment, NoopAgentAuthLifecycle } from "@viberglass/agent-core";
import type { AgentPlugin, AgentAuthLifecycle, IAgentGitService } from "@viberglass/agent-core";
import { isObjectRecord } from "@viberglass/types";
import type { CodexConfig } from "./config";
import { CodexAgent } from "./CodexAgent";
import { CodexAuthManager } from "./CodexAuthManager";
import { CodexAgentAuthLifecycle } from "./CodexAgentAuthLifecycle";
import { CHATGPT_SIGN_IN, resolveCodexAuthSettings } from "./codexAuthSettings";

function usesModelEndpoint(clankerConfig: Record<string, unknown> | undefined): boolean {
  const config = isObjectRecord(clankerConfig?.deploymentConfig) ? clankerConfig.deploymentConfig : clankerConfig;
  return config?.resolvedModelEndpoint !== undefined;
}

const codexPlugin: AgentPlugin<CodexConfig> = {
  id: "codex",
  label: "OpenAI Codex",
  description: "Reasoning-focused coding agent with API key and device auth support.",
  logo: "logo.ico",
  telemetryProvider: "openai",

  create(config, logger, gitService?: IAgentGitService) {
    return new CodexAgent(config, logger, gitService);
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
      "csharp",
    ],
    costPerExecution: 0.75,
    averageSuccessRate: 0.82,
    executionTimeLimit: 3000,
    resourceLimits: {
      maxMemoryMB: 2048,
      maxCpuPercent: 90,
      maxDiskSpaceMB: 1024,
      maxNetworkRequests: 120,
    },
    maxTokens: 8000,
    temperature: 0.0,
  },

  envAliases: {
    apiKey: ["OPENAI_API_KEY"],
    endpoint: ["CODEX_ENDPOINT", "OPENAI_BASE_URL"],
  },

  agentEnv: ["CODEX_AUTH_MODE", "CODEX_CONFIG", "CODEX_CONFIG_DIR", "CODEX_HOME", "INITIAL_AGENT_MODE"],

  stateDirs: [".codex"],
  // A run on a model endpoint writes config.toml; the next run must not inherit it.
  stateExcludes: [".codex/auth.json", ".codex/config.toml"],

  customEndpoints: {
    apiFormats: ["openai-responses"],
    environment: (endpoint) => new ModelEndpointConfigEnvironment(endpoint),
  },

  signInMethods: [CHATGPT_SIGN_IN],

  authLifecycle(ctx): AgentAuthLifecycle {
    // A model endpoint brings its own key; there's no OpenAI account to sign in to.
    if (usesModelEndpoint(ctx.clankerConfig)) return new NoopAgentAuthLifecycle();
    const settings = resolveCodexAuthSettings(ctx.clankerConfig);
    // CodexAgent reads it to leave the API key out when Codex signs in with ChatGPT.
    process.env.CODEX_AUTH_MODE = settings.usesChatGpt ? CHATGPT_SIGN_IN.id : "api_key";
    const codexAuthManager = new CodexAuthManager(ctx.logger, ctx.loginUploader, ctx.workDir, ctx.sendProgress, settings);

    return new CodexAgentAuthLifecycle({
      usesChatGpt: settings.usesChatGpt,
      materializeFromEnvironment: () => codexAuthManager.materializeAuthCacheFromEnv(),
      ensureDeviceAuth: (jobId, tenantId) => codexAuthManager.ensureDeviceAuth(jobId, tenantId),
      forceFreshDeviceAuth: (jobId, tenantId) => codexAuthManager.forceFreshDeviceAuth(jobId, tenantId),
      uploadIfRefreshed: (jobId, tenantId) => codexAuthManager.uploadIfRefreshed(jobId, tenantId),
    });
  },

  providers: [{ provider: "openai", envVar: "OPENAI_API_KEY", default: true }],

  docker: {
    variant: "codex",
    repositoryName: "viberator-worker-codex",
    scriptImageName: "worker-codex",
    supportedAgents: ["codex"],
    defaultForAgents: ["codex"],
    lambdaUnsupportedReason:
      "Codex can't run shell commands on AWS Lambda, which blocks a system call Codex makes for every command. Run it on ECS, Kubernetes or Docker.",
  },
};

export default codexPlugin;
