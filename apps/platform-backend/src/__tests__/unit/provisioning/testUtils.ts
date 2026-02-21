import type { Clanker } from "@viberglass/types";

export function buildClanker(
  strategyName: string,
  deploymentConfig?: Record<string, unknown> | null,
): Clanker {
  return {
    id: "8c0bc2ef-4c86-48a0-8a71-91dbe58a12be",
    name: "Test Clanker",
    slug: "test-clanker",
    description: null,
    deploymentStrategyId: "4de34310-8f61-41ef-aa68-fc1693efe294",
    deploymentStrategy: {
      id: "4de34310-8f61-41ef-aa68-fc1693efe294",
      name: strategyName,
      description: null,
      configSchema: null,
      createdAt: "2026-02-17T00:00:00.000Z",
    },
    deploymentConfig: deploymentConfig ?? null,
    configFiles: [],
    agent: "claude-code",
    secretIds: [],
    status: "inactive",
    statusMessage: null,
    createdAt: "2026-02-17T00:00:00.000Z",
    updatedAt: "2026-02-17T00:00:00.000Z",
  };
}
