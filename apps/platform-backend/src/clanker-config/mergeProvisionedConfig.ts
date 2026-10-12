import { DEFAULT_AGENT_TYPE, isObjectRecord } from "@viberglass/types";
import type {
  Clanker,
} from "@viberglass/types";
import { resolveClankerConfig } from "./index";

export function mergeProvisionedStrategyIntoConfig(
  clanker: Clanker,
  strategy: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = resolveClankerConfig(clanker).config;
  const agent = isObjectRecord(resolved.agent) ? { ...resolved.agent } : undefined;

  const nextConfig: Record<string, unknown> = {
    version: 1,
    strategy,
    agent: agent || { type: DEFAULT_AGENT_TYPE },
  };

  if (resolved.runtime) {
    nextConfig.runtime = resolved.runtime;
  }

  return nextConfig;
}
