import type { GeminiAgentConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeGeminiAgentConfig(value: unknown): GeminiAgentConfig {
  const source = toObjectRecord(value) || {};

  const normalized: GeminiAgentConfig = {
    type: "gemini-cli",
  };

  const model = toNonEmptyString(source.model);
  if (model) {
    normalized.model = model;
  }

  return normalized;
}
