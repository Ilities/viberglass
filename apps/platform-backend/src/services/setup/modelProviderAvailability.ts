import type { ModelProvider } from "@viberglass/types";

type Environment = Record<string, string | undefined>;

/**
 * The URL a provider's key is checked against, or null when this server isn't
 * configured for it (a check whose base URL comes from an unset env var).
 */
export function resolveKeyCheckUrl(provider: ModelProvider, env: Environment = process.env): string | null {
  const { url, baseUrlEnv } = provider.keyCheck;
  if (!baseUrlEnv) return url;
  const base = env[baseUrlEnv]?.trim();
  return base ? `${base.replace(/\/+$/, "")}${url}` : null;
}

export function isModelProviderAvailable(provider: ModelProvider, env: Environment = process.env): boolean {
  return resolveKeyCheckUrl(provider, env) !== null;
}
