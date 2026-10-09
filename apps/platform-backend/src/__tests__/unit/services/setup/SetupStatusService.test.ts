import type { Clanker, ClankerStatus, IntegrationCredential, Integration, ModelEndpoint, ModelProviderId, ProjectScmConfig } from "@viberglass/types";
import type { Project } from "@viberglass/types";
import { SetupStatusService } from "../../../../services/setup/SetupStatusService";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const GITHUB: Integration = {
  id: "integration-1",
  name: "GitHub",
  system: "github",
  config: {},
  isActive: true,
  createdAt: "",
  updatedAt: "",
};

const TOKEN: IntegrationCredential = {
  id: "credential-1",
  integrationId: "integration-1",
  name: "GitHub token",
  credentialType: "token",
  secretId: "secret-2",
  secretLocation: "database",
  isDefault: true,
  createdAt: "",
  updatedAt: "",
};

const PROJECT: Project = {
  id: "project-1",
  name: "Web",
  slug: "web",
  ticketSystem: "custom",
  credentials: { type: "token" },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
  isPrivate: false,
  keyPrefix: "WEB",
  defaultReviewerIds: [],
  questionReminderHours: 4,
  createdAt: "",
  updatedAt: "",
};

const SCM: ProjectScmConfig = {
  projectId: "project-1",
  integrationId: "integration-1",
  sourceRepository: "https://github.com/acme/web",
  baseBranch: "main",
  createdAt: "",
  updatedAt: "",
};

function runner(status: ClankerStatus): Clanker {
  return {
    id: "clanker-1",
    name: "Default agent",
    slug: "default-agent",
    description: null,
    deploymentStrategyId: null,
    deploymentStrategy: null,
    deploymentConfig: null,
    configFiles: [],
    agent: "opencode",
    secretBindings: [{ envVar: "OPENCODE_API_KEY", secretId: "secret-1" }],
    mcpServerIds: [],
    skillIds: [],
    status,
    statusMessage: "Docker image ready",
    createdAt: "",
    updatedAt: "",
  };
}

function service(state: { secrets?: ModelProviderId[]; github?: boolean; space?: boolean; agent?: ClankerStatus | null; endpoints?: ModelEndpoint[] }) {
  const defaultAgent = state.agent ? runner(state.agent) : null;
  return new SetupStatusService({
    secrets: {
      getLatestSecretForProvider: async (provider: ModelProviderId) =>
        state.secrets?.includes(provider) ? { id: provider } : null,
    },
    integrations: { listIntegrations: async () => (state.github ? [GITHUB] : []) },
    credentials: { getDefaultForIntegration: async () => (state.github ? TOKEN : null) },
    projects: { listProjects: async () => (state.space ? [PROJECT] : []) },
    scmConfigs: { getByProjectId: async () => (state.space ? SCM : null) },
    clankers: {
      getClankerBySlug: async () => defaultAgent,
      listClankers: async () => (defaultAgent ? [defaultAgent] : []),
    },
    demo: { getDemo: async () => null },
    endpoints: { list: async () => state.endpoints ?? [] },
  });
}

describe("SetupStatusService", () => {
  it("has everything left on a fresh workspace", async () => {
    await expect(service({}).getStatus()).resolves.toEqual({
      connectedProviders: [],
      connectedEndpoints: [],
      repositoryConnected: false,
      space: null,
      agent: null,
      complete: false,
      demo: null,
    });
  });

  it("reports what's done so the flow can resume", async () => {
    const status = await service({ secrets: ["opencode-go"], github: true, space: true, agent: "deploying" }).getStatus();

    expect(status).toEqual({
      connectedProviders: ["opencode-go"],
      connectedEndpoints: [],
      repositoryConnected: true,
      space: { projectId: "project-1", name: "Web", slug: "web", repositoryUrl: "https://github.com/acme/web" },
      agent: { clankerId: "clanker-1", agentName: "OpenCode", status: "deploying", statusMessage: "Docker image ready" },
      complete: false,
      demo: null,
    });
  });

  it("is complete once a space exists and a runner is active", async () => {
    const status = await service({ github: true, space: true, agent: "active" }).getStatus();

    expect(status.complete).toBe(true);
  });

  it("lists the workspace's model endpoints, which setup can run the agent on instead of a key", async () => {
    const endpoint: ModelEndpoint = {
      id: "e-1",
      name: "z.ai",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiFormat: "openai-chat",
      auth: { scheme: "bearer" },
      secretId: "s",
      extraHeaders: {},
      models: ["glm-4.7-flash"],
      mayColdStart: false,
      source: "manual",
      deploymentId: null,
      createdAt: "",
      updatedAt: "",
    };
    const status = await service({ endpoints: [endpoint] }).getStatus();
    expect(status.connectedEndpoints).toEqual([{ id: "e-1", name: "z.ai", models: ["glm-4.7-flash"] }]);
  });
});
