function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Adds the runner's model to an `OPENCODE_CONFIG_CONTENT` value as both
 * `model` and `small_model`. OpenCode has no model env var, and without
 * these it falls back to its own provider's models, which an API key for
 * another provider can't use. The small model writes session titles.
 */
export function withOpenCodeModel(configContent: string | undefined, model: string): string {
  if (!configContent) return JSON.stringify({ model, small_model: model });
  let parsed: unknown;
  try {
    parsed = JSON.parse(configContent);
  } catch {
    // Left as it is, so OpenCode reports the broken config itself.
    return configContent;
  }
  return isRecord(parsed) ? JSON.stringify({ ...parsed, model, small_model: model }) : configContent;
}
