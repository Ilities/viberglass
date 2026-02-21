import type {
  Clanker,
  DockerStrategyConfig,
  EcsStrategyConfig,
  LambdaStrategyConfig,
} from "@viberglass/types";
import { resolveClankerConfig } from "../../clanker-config";

export function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function getNonEmptyString(value: unknown): string | null {
  return getOptionalString(value) || null;
}

export function getDockerStrategyConfig(clanker: Clanker): DockerStrategyConfig {
  const resolved = resolveClankerConfig(clanker).config;
  if (resolved.strategy.type !== "docker") {
    return {
      type: "docker",
      provisioningMode: "managed",
    };
  }

  return resolved.strategy;
}

export function getEcsStrategyConfig(clanker: Clanker): EcsStrategyConfig {
  const resolved = resolveClankerConfig(clanker).config;
  if (resolved.strategy.type !== "ecs") {
    return {
      type: "ecs",
      provisioningMode: "managed",
    };
  }

  return resolved.strategy;
}

export function getLambdaStrategyConfig(clanker: Clanker): LambdaStrategyConfig {
  const resolved = resolveClankerConfig(clanker).config;
  if (resolved.strategy.type !== "lambda") {
    return {
      type: "lambda",
      provisioningMode: "managed",
    };
  }

  return resolved.strategy;
}
