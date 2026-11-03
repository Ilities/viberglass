import { SCM_TOKEN_ENV_VAR, type Clanker, type ProjectScmConfig } from "@viberglass/types";
import type { Project } from "@viberglass/types";
import { APP_CONTRACT_SKILL } from "../../../../services/skills/appContractSkill";
import { buildScmPayloadFromContext, prepareTicketRunContext } from "../../../../services/ticketRunOrchestration";

const project: Project = {
  backingKind: "git",
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
  mcpServerIds: ["server-1"],
  skillIds: ["skill-1"],
  status: "active",
  statusMessage: null,
  createdAt: "",
  updatedAt: "",
};

function prepare(
  additionalSecretBindings = [{ envVar: "NOTION_TOKEN", secretId: "template-notion" }],
  files?: { env?: Record<string, string>; strategy?: string },
  scm: ProjectScmConfig = scmConfig,
  backingKind: Project["backingKind"] = files ? "files" : "git",
) {
  const scmConfigs = jest.fn(async () => scm);
  const space: Project = { ...project, backingKind };
  const clanker: Clanker = files?.strategy
    ? { ...runner, deploymentConfig: { ...runner.deploymentConfig!, strategy: { type: files.strategy } } as Clanker["deploymentConfig"] }
    : runner;
  return prepareTicketRunContext(
    { projectId: "project-1", clankerId: "clanker-1", jobId: "job-1", additionalSecretBindings },
    {
      storageEnvironment: () => files?.env ?? {},
      projectDAO: { getProject: jest.fn(async () => space) },
      projectScmConfigDAO: { getByProjectId: scmConfigs },
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
        getDefaultForIntegration: jest.fn(async () => ({
          id: "credential-default",
          integrationId: "integration-1",
          name: "GitHub token",
          credentialType: "token" as const,
          secretId: "default-token",
          secretLocation: "database" as const,
          isDefault: true,
          description: null,
          expiresAt: null,
          lastUsedAt: null,
          createdAt: "",
          updatedAt: "",
        })),
      },
      clankerDAO: { getClanker: jest.fn(async () => clanker), updateStatus: jest.fn() },
      provisioningService: { resolveAvailabilityStatus: jest.fn(async () => ({ status: "active" as const })) },
      instructionStorageService: { uploadJobInstructionFiles: jest.fn() },
      runnerTools: {
        resolve: jest.fn(async () => ({
          mcpServers: [{ name: "linear", url: "https://mcp.linear.app/mcp", headers: [{ name: "Authorization", envVar: "VIBERGLASS_MCP_0_0" }] }],
          skills: [{ id: "skill-1", name: "pdf-forms" }],
          modelEndpoint: { name: "EU models", baseUrl: "https://eu.example.com/v1", apiFormat: "openai-chat" as const,
            auth: { scheme: "none" as const }, extraHeaders: {}, model: "qwen", mayColdStart: false },
          secretBindings: [{ envVar: "VIBERGLASS_MCP_0_0", secretId: "linear-token" }],
        })),
      },
    },
  );
}

describe("a run's secret bindings", () => {
  it("adds the repository token under the worker-only variable and lets the template override the runner", async () => {
    const context = await prepare();

    expect(context.executionClanker.secretBindings).toEqual([
      { envVar: "ANTHROPIC_API_KEY", secretId: "team-key" },
      { envVar: "NOTION_TOKEN", secretId: "template-notion" },
      { envVar: "VIBERGLASS_MCP_0_0", secretId: "linear-token" },
      { envVar: SCM_TOKEN_ENV_VAR, secretId: "repo-token" },
    ]);
  });

  it("carries the runner's MCP servers and skills for the worker's payload", async () => {
    const context = await prepare([]);

    expect(context.mcpServers.map((server) => server.name)).toEqual(["linear"]);
    expect(context.skills).toEqual([{ id: "skill-1", name: "pdf-forms" }]);
  });

  it("carries the resolved endpoint in the execution config without changing the stored runner", async () => {
    const context = await prepare([]);
    expect(context.executionClanker.deploymentConfig?.resolvedModelEndpoint).toMatchObject({
      baseUrl: "https://eu.example.com/v1", model: "qwen", auth: { scheme: "none" },
    });
    expect(runner.deploymentConfig?.resolvedModelEndpoint).toBeUndefined();
  });

  it("tells the worker which variable holds the repository token", async () => {
    const context = await prepare([]);

    expect(buildScmPayloadFromContext(context)).toMatchObject({
      credentialSecretId: "repo-token",
      credentialEnvVar: SCM_TOKEN_ENV_VAR,
    });
  });

  it("uses the connection's default token when the space chose none, as pull requests do", async () => {
    const context = await prepare([], undefined, { ...scmConfig, integrationCredentialId: null });

    expect(buildScmPayloadFromContext(context)).toMatchObject({ credentialSecretId: "default-token" });
    expect(context.executionClanker.secretBindings).toContainEqual({ envVar: SCM_TOKEN_ENV_VAR, secretId: "default-token" });
  });
});

describe("a run in a Files space", () => {
  const STORAGE = { S3_BUCKET: "files" };

  it("works on the space's files without a repository or its token", async () => {
    const context = await prepare([], { env: STORAGE });

    expect(context.sourceRepository).toBe("");
    expect(context.scmConfig).toBeNull();
    expect(context.executionClanker.secretBindings.map((binding) => binding.envVar)).not.toContain(SCM_TOKEN_ENV_VAR);
  });

  it("needs file storage to save the agent's files", async () => {
    await expect(prepare([], {})).rejects.toMatchObject({ code: "FILES_STORAGE_UNAVAILABLE", statusCode: 409 });
  });

  it("refuses runners on Lambda", async () => {
    await expect(prepare([], { env: STORAGE, strategy: "lambda" })).rejects.toMatchObject({ code: "FILES_RUNNER_UNSUPPORTED" });
  });
});

describe("a run in an App space", () => {
  it("gets the app contract skill after the runner's own skills", async () => {
    const context = await prepare([], undefined, scmConfig, "app");

    expect(context.skills).toEqual([{ id: "skill-1", name: "pdf-forms" }, APP_CONTRACT_SKILL]);
    expect(context.sourceRepository).toBe("https://github.com/acme/web");
  });

  it("is the only kind of space that gets it", async () => {
    const git = await prepare([]);
    const files = await prepare([], { env: { S3_BUCKET: "files" } });

    expect(git.skills).not.toContainEqual(APP_CONTRACT_SKILL);
    expect(files.skills).not.toContainEqual(APP_CONTRACT_SKILL);
  });
});
