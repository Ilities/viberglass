import type { KimiAgentConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeKimiAgentConfig(value: unknown): KimiAgentConfig {
  const source = toObjectRecord(value) || {};

  const normalized: KimiAgentConfig = {
    type: "kimi-code",
  };

  const endpoint = toNonEmptyString(source.endpoint);
  if (endpoint) {
    normalized.endpoint = endpoint;
  }

  const model = toNonEmptyString(source.model);
  if (model) {
    normalized.model = model;
  }

  return normalized;
}
