import type { QwenAgentConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord } from "../parsers";

export function normalizeQwenAgentConfig(value: unknown): QwenAgentConfig {
  const source = toObjectRecord(value) || {};

  const normalized: QwenAgentConfig = {
    type: "qwen-cli",
  };

  const endpoint =
    toNonEmptyString(source.endpoint) || toNonEmptyString(source.qwenEndpoint);
  if (endpoint) {
    normalized.endpoint = endpoint;
  }

  return normalized;
}
