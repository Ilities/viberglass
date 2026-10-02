import type { KubernetesStrategyConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeKubernetesStrategyConfig(value: unknown): KubernetesStrategyConfig {
  const source = toObjectRecord(value) || {};

  return {
    type: "kubernetes",
    provisioningMode: "prebuilt",
    containerImage: toNonEmptyString(source.containerImage),
    namespace: toNonEmptyString(source.namespace),
    cpu: toNonEmptyString(source.cpu),
    memory: toNonEmptyString(source.memory),
    ephemeralStorage: toNonEmptyString(source.ephemeralStorage),
    activeDeadlineSeconds:
      typeof source.activeDeadlineSeconds === "number" &&
      Number.isInteger(source.activeDeadlineSeconds) &&
      source.activeDeadlineSeconds > 0
        ? source.activeDeadlineSeconds
        : undefined,
  };
}
