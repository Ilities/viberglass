import type {
  Clanker,
} from "@viberglass/types";
import { resolveClankerConfig } from "./index";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return { ...value };
}

export function mergeProvisionedStrategyIntoConfig(
  clanker: Clanker,
  strategy: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = resolveClankerConfig(clanker).config;
  const agent = toRecord(resolved.agent);

  const nextConfig: Record<string, unknown> = {
    version: 1,
    strategy,
    agent: agent || { type: "claude-code" },
  };

  if (resolved.runtime) {
    nextConfig.runtime = resolved.runtime;
  }

  return nextConfig;
}
