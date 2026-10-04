import { runnerReadiness, type Clanker, type ModelEndpoint, type RunnerLastRun } from "@viberglass/types";
import { ClankerReadinessService } from "../../../services/ClankerReadinessService";

const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function runner(overrides: Partial<Clanker> = {}): Clanker {
  return {
    id: "c-1",
    name: "Claude",
    slug: "claude",
    deploymentStrategyId: "docker",
    deploymentConfig: null,
    configFiles: [],
    agent: "claude-code",
    secretBindings: [{ envVar: "ANTHROPIC_API_KEY", secretId: KEY }],
    mcpServerIds: [],
    skillIds: [],
    status: "active",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

const REJECTED: RunnerLastRun = { status: "failed", failureCode: "AGENT_CREDENTIAL_INVALID", failureTitle: "Model key rejected", at: "2026-10-02T00:00:00Z" };
const ENDPOINT: ModelEndpoint = {
  id: "endpoint", name: "EU models", baseUrl: "https://models.example.com/v1", apiFormat: "openai-chat",
  auth: { scheme: "bearer" }, secretId: KEY, models: ["qwen"], extraHeaders: {}, mayColdStart: false,
  source: "manual", deploymentId: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z",
};
const endpointRunner = () => runner({ agent: "opencode", modelEndpoint: { endpointId: ENDPOINT.id, model: "qwen" }, secretBindings: [] });

describe("runnerReadiness", () => {
  it("is ready when configured with an existing key and running", () => {
    expect(runnerReadiness(runner(), new Set([KEY]), null)).toEqual({ state: "ready", problem: null, lastRun: null });
  });

  it("uses credentials from its selected endpoint rather than requiring a runner key", () => {
    expect(runnerReadiness(endpointRunner(), new Set(), null).state).toBe("ready");
    expect(runnerReadiness(endpointRunner(), new Set(), REJECTED).state).toBe("credential_rejected");
  });

  it("never calls a runner without a usable key ready, whatever its compute says", () => {
    expect(runnerReadiness(runner({ secretBindings: [] }), new Set(), null).state).toBe("needs_key");
    expect(runnerReadiness(runner(), new Set(), null)).toMatchObject({ state: "needs_key", problem: expect.stringContaining("deleted") });
  });

  it("needs a ChatGPT login for a Codex runner set up to sign in", () => {
    const codex = runner({
      agent: "codex",
      secretBindings: [],
      deploymentConfig: { version: 1, strategy: { type: "docker" }, agent: { type: "codex", codexAuth: { mode: "chatgpt_device", secretName: "CODEX_AUTH" } } },
    });
    expect(runnerReadiness(codex, new Set(), null).state).toBe("needs_login");
  });

  it("separates a configured runner whose compute isn't up", () => {
    expect(runnerReadiness(runner({ status: "inactive" }), new Set([KEY]), null)).toMatchObject({ state: "not_running" });
  });

  it("isn't ready after the provider rejected its key", () => {
    expect(runnerReadiness(runner(), new Set([KEY]), REJECTED)).toMatchObject({ state: "credential_rejected", lastRun: REJECTED });
  });
});

describe("ClankerReadinessService", () => {
  function setup(secretUpdatedAt = "2026-10-01T00:00:00Z", lastRun: RunnerLastRun | null = REJECTED) {
    const deps = {
      secrets: { getSecretsByIds: jest.fn().mockResolvedValue([{ id: KEY, updatedAt: new Date(secretUpdatedAt) }]) },
      runs: { latestFinishedByClanker: jest.fn().mockResolvedValue(new Map(lastRun ? [["c-1", lastRun]] : [])) },
      endpoints: { get: jest.fn().mockResolvedValue(ENDPOINT) },
    };
    return { deps, service: new ClankerReadinessService(deps) };
  }

  it("attaches readiness and the latest run to each runner", async () => {
    const { deps, service } = setup();
    const [withReadiness] = await service.withReadiness([runner()]);

    expect(deps.secrets.getSecretsByIds).toHaveBeenCalledWith([KEY]);
    expect(withReadiness.readiness).toMatchObject({ state: "credential_rejected", lastRun: REJECTED });
  });

  it("clears a rejected endpoint credential after its shared key or endpoint changes", async () => {
    const original = setup();
    const [rejected] = await original.service.withReadiness([endpointRunner()]);
    expect(rejected.readiness?.state).toBe("credential_rejected");
    expect(original.deps.secrets.getSecretsByIds).toHaveBeenCalledWith([KEY]);

    const [keyChanged] = await setup("2026-10-03T00:00:00Z").service.withReadiness([endpointRunner()]);
    expect(keyChanged.readiness).toMatchObject({ state: "ready", lastRun: REJECTED });

    const edited = setup();
    edited.deps.endpoints.get.mockResolvedValue({ ...ENDPOINT, updatedAt: "2026-10-03T00:00:00Z" });
    const [endpointChanged] = await edited.service.withReadiness([endpointRunner()]);
    expect(endpointChanged.readiness?.state).toBe("ready");
  });

  it("forgets a rejected key once the key or the runner changed after that run", async () => {
    const { service } = setup("2026-10-03T00:00:00Z");
    const [keyReplaced] = await service.withReadiness([runner()]);
    expect(keyReplaced.readiness).toMatchObject({ state: "ready", lastRun: REJECTED });

    const [runnerEdited] = await setup().service.withReadiness([runner({ updatedAt: "2026-10-03T00:00:00Z" })]);
    expect(runnerEdited.readiness?.state).toBe("ready");
  });
});
