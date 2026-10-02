import type { AntigravityAgentConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeAntigravityAgentConfig(value: unknown): AntigravityAgentConfig {
  const source = toObjectRecord(value) || {};

  const normalized: AntigravityAgentConfig = {
    type: "antigravity",
  };

  const model = toNonEmptyString(source.model);
  if (model) {
    normalized.model = model;
  }

  return normalized;
}
