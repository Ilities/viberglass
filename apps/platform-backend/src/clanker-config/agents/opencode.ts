import type { OpenCodeAgentConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeOpenCodeAgentConfig(value: unknown): OpenCodeAgentConfig {
  const source = toObjectRecord(value) || {};

  const normalized: OpenCodeAgentConfig = {
    type: "opencode",
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
