import type { Clanker } from "@viberglass/types";
import { AgentLoginJobService } from "../../../../services/codexLogin/AgentLoginJobService";

jest.mock("../../../../persistence/clanker/ClankerDAO", () => ({ ClankerDAO: jest.fn() }));
jest.mock("../../../../services/JobService", () => ({ JobService: jest.fn() }));
jest.mock("../../../../services/job/JobBootstrapService", () => ({ JobBootstrapService: jest.fn() }));
jest.mock("../../../../services/CredentialRequirementsService", () => ({ CredentialRequirementsService: jest.fn() }));
jest.mock("../../../../workers/WorkerExecutionService", () => ({ WorkerExecutionService: jest.fn() }));

function runner(overrides: Partial<Clanker> = {}, mode = "chatgpt_device_stored"): Clanker {
  return {
    id: "runner-1",
    name: "Codex runner",
    slug: "codex-runner",
    description: null,
    deploymentStrategyId: "docker",
    deploymentStrategy: null,
    deploymentConfig: {
      version: 1,
      strategy: { type: "docker" },
      agent: { type: "codex", codexAuth: { mode, secretName: "CODEX_AUTH_JSON" } },
    },
    configFiles: [],
    agent: "codex",
    secretBindings: [],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    statusMessage: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function build(clanker: Clanker | null) {
  const submitJob = jest.fn(async () => ({ jobId: "j", status: "queued", timestamp: "", callbackToken: "token" }));
  const saveBootstrapPayload = jest.fn(async () => undefined);
  const getRequiredCredentialsForClanker = jest.fn(async () => []);
  const executeJob = jest.fn(async () => ({ success: true, attempts: 1, executionId: "e" }));
  const service = new AgentLoginJobService(
    { getClanker: jest.fn(async () => clanker) },
    { submitJob },
    { saveBootstrapPayload },
    { getRequiredCredentialsForClanker },
    { executeJob },
  );
  return { service, submitJob, saveBootstrapPayload, executeJob };
}

describe("AgentLoginJobService", () => {
  it("starts a login-only job on the runner, with no repository", async () => {
    const { service, submitJob, saveBootstrapPayload, executeJob } = build(runner());

    const { jobId } = await service.start("runner-1");

    expect(submitJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: jobId, jobKind: "agent_login", repository: "" }),
      { clankerId: "runner-1" },
    );
    expect(saveBootstrapPayload).toHaveBeenCalledWith(
      jobId,
      expect.objectContaining({ jobKind: "agent_login", callbackToken: "token", instructionFiles: [] }),
    );
    expect(executeJob).toHaveBeenCalled();
  });

  it("refuses a runner that signs in with an API key", async () => {
    const { service } = build(runner({}, "api_key"));
    await expect(service.start("runner-1")).rejects.toMatchObject({ code: "LOGIN_NOT_APPLICABLE" });
  });

  it("asks for the runner to be started first", async () => {
    const { service } = build(runner({ status: "inactive" }));
    await expect(service.start("runner-1")).rejects.toMatchObject({ code: "NOT_RUNNING", statusCode: 409 });
  });
});
