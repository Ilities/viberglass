import type { AgentPlugin, IAgentGitService } from "@viberglass/agent-core";
import type { FakeConfig } from "./config";
import { FakeAgent } from "./FakeAgent";

const fakePlugin: AgentPlugin<FakeConfig> = {
  id: "fake",
  displayName: "Fake (end-to-end tests)",

  create(config, logger, gitService?: IAgentGitService) {
    return new FakeAgent(config, logger, gitService);
  },

  defaultConfig: {
    apiKey: "",
    capabilities: [],
    costPerExecution: 0,
    averageSuccessRate: 1,
    executionTimeLimit: 600,
    resourceLimits: {
      maxMemoryMB: 256,
      maxCpuPercent: 50,
      maxDiskSpaceMB: 128,
      maxNetworkRequests: 0,
    },
  },

  stateDir: ".fake",

  docker: {
    variant: "fake",
    repositoryName: "viberator-worker-fake",
    scriptImageName: "worker-fake",
    supportedAgents: ["fake"],
    defaultForAgents: ["fake"],
    testOnly: true,
  },
};

export default fakePlugin;
