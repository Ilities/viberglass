import { SCM_TOKEN_ENV_VAR, type Clanker, type ProjectScmConfig } from "@viberglass/types";
import type { ProjectConfig } from "../../../../models/PMIntegration";
import { buildScmPayloadFromContext, prepareTicketRunContext } from "../../../../services/ticketRunOrchestration";

const project: ProjectConfig = {
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

const scmConfig: ProjectScmConfig = {
  projectId: "project-1",
  integrationId: "integration-1",
  integrationCredentialId: "credential-1",
  sourceRepository: "https://github.com/acme/web",
  baseBranch: "main",
  createdAt: "",
  updatedAt: "",
};

const runner: Clanker = {
  id: "clanker-1",
  name: "Runner",
  slug: "runner",
  description: null,
  deploymentStrategyId: "docker-id",
  deploymentStrategy: null,
  deploymentConfig: { version: 1, strategy: { type: "docker" }, agent: { type: "claude-code" } },
  configFiles: [],
  agent: "claude-code",
  secretBindings: [
    { envVar: "ANTHROPIC_API_KEY", secretId: "team-key" },
    { envVar: "NOTION_TOKEN", secretId: "runner-notion" },
  ],
  status: "active",
  statusMessage: null,
  createdAt: "",
  updatedAt: "",
};

function prepare(additionalSecretBindings = [{ envVar: "NOTION_TOKEN", secretId: "template-notion" }]) {
  return prepareTicketRunContext(
    { projectId: "project-1", clankerId: "clanker-1", jobId: "job-1", additionalSecretBindings },
    {
      projectDAO: { getProject: jest.fn(async () => project) },
      projectScmConfigDAO: { getByProjectId: jest.fn(async () => scmConfig) },
      integrationCredentialDAO: {
        getById: jest.fn(async () => ({
          id: "credential-1",
          integrationId: "integration-1",
          name: "GitHub token",
          credentialType: "token" as const,
          secretId: "repo-token",
          secretLocation: "database" as const,
          isDefault: true,
          description: null,
          expiresAt: null,
          lastUsedAt: null,
          createdAt: "",
          updatedAt: "",
        })),
      },
      clankerDAO: { getClanker: jest.fn(async () => runner), updateStatus: jest.fn() },
      provisioningService: { resolveAvailabilityStatus: jest.fn(async () => ({ status: "active" as const })) },
      instructionStorageService: { uploadJobInstructionFiles: jest.fn() },
    },
  );
}

describe("a run's secret bindings", () => {
  it("adds the repository token under the worker-only variable and lets the template override the runner", async () => {
    const context = await prepare();

    expect(context.executionClanker.secretBindings).toEqual([
      { envVar: "ANTHROPIC_API_KEY", secretId: "team-key" },
      { envVar: "NOTION_TOKEN", secretId: "template-notion" },
      { envVar: SCM_TOKEN_ENV_VAR, secretId: "repo-token" },
    ]);
  });

  it("tells the worker which variable holds the repository token", async () => {
    const context = await prepare([]);

    expect(buildScmPayloadFromContext(context)).toMatchObject({
      credentialSecretId: "repo-token",
      credentialEnvVar: SCM_TOKEN_ENV_VAR,
    });
  });
});
