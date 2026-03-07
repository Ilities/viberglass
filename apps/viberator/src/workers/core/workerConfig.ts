import { isObjectRecord } from "@viberglass/types";
import type { WorkerPayload } from "./types";

export function resolveClankerConfig(
  payload: WorkerPayload,
): ({ clankerId: string } & Record<string, unknown>) | undefined {
  const clankerId = payload.clankerId;
  if (payload.workerType === "docker") {
    return isObjectRecord(payload.clankerConfig)
      ? { ...payload.clankerConfig, clankerId }
      : undefined;
  }

  if (isObjectRecord(payload.deploymentConfig)) {
    return { ...payload.deploymentConfig, clankerId };
  }

  const fallbackClankerConfig = Reflect.get(payload, "clankerConfig");
  return isObjectRecord(fallbackClankerConfig)
    ? { ...fallbackClankerConfig, clankerId }
    : undefined;
}

export function extractClankerEnvironment(
  config?: { clankerId: string } & Record<string, unknown>,
  endpointEnvironment?: Record<string, string>,
): Record<string, string> | undefined {
  const environment: Record<string, string> = {};
  const source = config?.environment;

  if (isObjectRecord(source)) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "string") {
        environment[key] = value;
      }
    }
  }

  if (endpointEnvironment) {
    for (const [key, value] of Object.entries(endpointEnvironment)) {
      environment[key] = value;
    }
  }

  return Object.keys(environment).length > 0 ? environment : undefined;
}

export function normalizeAgentName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
