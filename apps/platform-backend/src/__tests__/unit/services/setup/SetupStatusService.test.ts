import type { Clanker, ClankerStatus, IntegrationCredential, Integration, ProjectScmConfig } from "@viberglass/types";
import type { ProjectConfig } from "../../../../models/PMIntegration";
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

const PROJECT: ProjectConfig = {
  id: "project-1",
  name: "Web",
  slug: "web",
  ticketSystem: "custom",
  credentials: { type: "token" },
  autoFixEnabled: false,
  autoFixTags: [],
  customFieldMappings: {},
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
    secretIds: ["secret-1"],
    status,
    statusMessage: "Docker image ready",
    createdAt: "",
    updatedAt: "",
  };
}

function service(state: { secrets?: string[]; github?: boolean; space?: boolean; agent?: ClankerStatus | null }) {
  const defaultAgent = state.agent ? runner(state.agent) : null;
  return new SetupStatusService({
    secrets: {
      getSecretByName: async (name: string) => (state.secrets?.includes(name) ? { id: name } : null),
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
  });
}

describe("SetupStatusService", () => {
  it("has everything left on a fresh workspace", async () => {
    await expect(service({}).getStatus()).resolves.toEqual({
      connectedProviders: [],
      repositoryConnected: false,
      space: null,
      agent: null,
      complete: false,
      demo: null,
    });
  });

  it("reports what's done so the flow can resume", async () => {
    const status = await service({ secrets: ["OPENCODE_API_KEY"], github: true, space: true, agent: "deploying" }).getStatus();

    expect(status).toEqual({
      connectedProviders: ["opencode-go"],
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
});
