import { isObjectRecord, type Clanker } from "@viberglass/types";
import { mergeProvisionedStrategyIntoConfig } from "../../../clanker-config/mergeProvisionedConfig";

function cloneObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  return { ...value };
}

function buildBaseClanker(overrides: Partial<Clanker>): Clanker {
  return {
    id: "a0b7f08b-cf96-4d8e-9b2b-fd451e390ec2",
    name: "Codex Worker",
    slug: "codex-worker",
    description: null,
    deploymentStrategyId: "ac5a3a8a-c69d-45df-84a8-b24011c7ff69",
    deploymentStrategy: {
      id: "ac5a3a8a-c69d-45df-84a8-b24011c7ff69",
      name: "docker",
      description: null,
      configSchema: null,
      createdAt: "2026-02-20T00:00:00.000Z",
    },
    deploymentConfig: null,
    configFiles: [],
    agent: "codex",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeProvisionedStrategyIntoConfig", () => {
  it("preserves codex chatgpt device auth in v1 config", () => {
    const clanker = buildBaseClanker({
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
          provisioningMode: "managed",
        },
        agent: {
          type: "codex",
          codexAuth: {
            mode: "chatgpt_device",
            secretName: "CODEX_AUTH_JSON",
          },
        },
        runtime: {
          settings: {
            maxChanges: 25,
          },
        },
      },
    });

    const merged = mergeProvisionedStrategyIntoConfig(clanker, {
      type: "docker",
      provisioningMode: "prebuilt",
      containerImage: "ghcr.io/org/worker:latest",
    });

    const strategy = cloneObjectRecord(merged.strategy);
    const agent = cloneObjectRecord(merged.agent);
    const codexAuth = cloneObjectRecord(agent?.codexAuth);
    const runtime = cloneObjectRecord(merged.runtime);
    const settings = cloneObjectRecord(runtime?.settings);

    expect(strategy?.type).toBe("docker");
    expect(strategy?.containerImage).toBe("ghcr.io/org/worker:latest");
    expect(agent?.type).toBe("codex");
    expect(codexAuth?.mode).toBe("chatgpt_device");
    expect(settings?.maxChanges).toBe(25);
  });

  it("preserves codex chatgpt device auth when source config is legacy", () => {
    const clanker = buildBaseClanker({
      deploymentConfig: {
        containerImage: "old-image",
        codexAuth: {
          mode: "chatgpt_device",
          secretName: "CODEX_AUTH_JSON",
        },
      },
    });

    const merged = mergeProvisionedStrategyIntoConfig(clanker, {
      type: "docker",
      provisioningMode: "prebuilt",
      containerImage: "new-image",
    });

    expect(merged.version).toBe(1);
    const strategy = cloneObjectRecord(merged.strategy);
    const agent = cloneObjectRecord(merged.agent);
    const codexAuth = cloneObjectRecord(agent?.codexAuth);

    expect(agent?.type).toBe("codex");
    expect(codexAuth?.mode).toBe("chatgpt_device");
    expect(strategy?.type).toBe("docker");
    expect(strategy?.containerImage).toBe("new-image");
  });

  it("preserves qwen endpoint settings in v1 config", () => {
    const clanker = buildBaseClanker({
      agent: "qwen-cli",
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
          provisioningMode: "managed",
        },
        agent: {
          type: "qwen-cli",
          endpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        },
      },
    });

    const merged = mergeProvisionedStrategyIntoConfig(clanker, {
      type: "docker",
      provisioningMode: "prebuilt",
      containerImage: "ghcr.io/org/worker:qwen",
    });

    const strategy = cloneObjectRecord(merged.strategy);
    const agent = cloneObjectRecord(merged.agent);

    expect(strategy?.type).toBe("docker");
    expect(strategy?.containerImage).toBe("ghcr.io/org/worker:qwen");
    expect(agent?.type).toBe("qwen-cli");
    expect(agent?.endpoint).toBe(
      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    );
  });

  it("preserves opencode endpoint and model in v1 config", () => {
    const clanker = buildBaseClanker({
      agent: "opencode",
      deploymentConfig: {
        version: 1,
        strategy: {
          type: "docker",
          provisioningMode: "managed",
        },
        agent: {
          type: "opencode",
          endpoint: "https://openrouter.ai/api/v1",
          model: "openai/gpt-5",
        },
      },
    });

    const merged = mergeProvisionedStrategyIntoConfig(clanker, {
      type: "docker",
      provisioningMode: "prebuilt",
      containerImage: "ghcr.io/org/worker:opencode",
    });

    const strategy = cloneObjectRecord(merged.strategy);
    const agent = cloneObjectRecord(merged.agent);

    expect(strategy?.type).toBe("docker");
    expect(strategy?.containerImage).toBe("ghcr.io/org/worker:opencode");
    expect(agent?.type).toBe("opencode");
    expect(agent?.endpoint).toBe("https://openrouter.ai/api/v1");
    expect(agent?.model).toBe("openai/gpt-5");
  });
});
