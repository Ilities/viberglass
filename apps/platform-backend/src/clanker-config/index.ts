import type {
  AgentType,
  Clanker,
  ClankerAgentConfig,
  ClankerConfigV1,
  ClankerStrategyConfig,
  ClankerStrategyType,
  CodexAuthConfig,
} from "@viberglass/types";
import {
  DEFAULT_AGENT_TYPE,
  getAgentSettingFields,
  isClankerConfigV1,
  pickSettingValues,
} from "@viberglass/types";
import { normalizeCodexAuthConfig } from "./codexAuth";
import { toNonEmptyString, toObjectRecord } from "./parsers";
import { normalizeDockerStrategyConfig } from "./strategies/docker";
import { normalizeEcsStrategyConfig } from "./strategies/ecs";
import { normalizeLambdaStrategyConfig } from "./strategies/lambda";
import { normalizeKubernetesStrategyConfig } from "./strategies/kubernetes";

export interface ResolvedClankerConfig {
  config: ClankerConfigV1;
}

function normalizeStrategyName(name: string | undefined): ClankerStrategyType {
  const normalized = (name || "").toLowerCase();
  if (normalized === "ecs") {
    return "ecs";
  }
  if (normalized === "lambda" || normalized === "aws-lambda-container") {
    return "lambda";
  }
  if (normalized === "kubernetes") {
    return "kubernetes";
  }
  return "docker";
}

function normalizeStrategy(strategyType: ClankerStrategyType, strategy: unknown): ClankerStrategyConfig {
  if (strategyType === "ecs") {
    return normalizeEcsStrategyConfig(strategy);
  }
  if (strategyType === "lambda") {
    return normalizeLambdaStrategyConfig(strategy);
  }
  if (strategyType === "kubernetes") {
    return normalizeKubernetesStrategyConfig(strategy);
  }
  return normalizeDockerStrategyConfig(strategy);
}

/** The harness and the settings it declares; anything else on the stored agent is dropped. */
function normalizeAgent(agent: unknown, fallbackAgent: AgentType | null | undefined): ClankerAgentConfig {
  const source = toObjectRecord(agent) || {};
  const type = toNonEmptyString(source.type) || fallbackAgent || DEFAULT_AGENT_TYPE;
  return {
    type,
    ...pickSettingValues(getAgentSettingFields(type), source),
    // Signing in isn't a declared setting yet, so Codex keeps its own.
    ...(type === "codex" ? { codexAuth: normalizeCodexAuthConfig(source.codexAuth) } : {}),
  };
}

/** The runner's config, with defaults for a runner saved without one. */
export function resolveClankerConfig(clanker: Clanker): ResolvedClankerConfig {
  const stored = isClankerConfigV1(clanker.deploymentConfig) ? clanker.deploymentConfig : null;
  const strategyType = stored?.strategy.type || normalizeStrategyName(clanker.deploymentStrategy?.name);
  return {
    config: {
      version: 1,
      strategy: normalizeStrategy(strategyType, stored?.strategy),
      agent: normalizeAgent(stored?.agent, clanker.agent),
      ...(stored?.runtime ? { runtime: stored.runtime } : {}),
    },
  };
}

export function getCodexAuthConfig(clanker: Clanker): CodexAuthConfig | null {
  return resolveClankerConfig(clanker).config.agent.codexAuth ?? null;
}

export function getStrategyType(clanker: Clanker): ClankerStrategyType {
  return resolveClankerConfig(clanker).config.strategy.type;
}
