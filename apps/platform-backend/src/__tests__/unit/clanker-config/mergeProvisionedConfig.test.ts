import type { Clanker } from "@viberglass/types";
import { mergeProvisionedStrategyIntoConfig } from "../../../clanker-config/mergeProvisionedConfig";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
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

    const strategy = asRecord(merged.strategy);
    const agent = asRecord(merged.agent);
    const codexAuth = asRecord(agent?.codexAuth);
    const runtime = asRecord(merged.runtime);
    const settings = asRecord(runtime?.settings);

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
    const strategy = asRecord(merged.strategy);
    const agent = asRecord(merged.agent);
    const codexAuth = asRecord(agent?.codexAuth);

    expect(agent?.type).toBe("codex");
    expect(codexAuth?.mode).toBe("chatgpt_device");
    expect(strategy?.type).toBe("docker");
    expect(strategy?.containerImage).toBe("new-image");
  });
});
