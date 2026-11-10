/** A model name's dash-separated parts, without a `[1m]`-style tag or an `@snapshot` suffix. */
function modelParts(name: string): string[] {
  return name.toLowerCase().replace(/\[[^\]]*\]/g, "").split("@")[0].trim().split("-").filter(Boolean);
}

function startsWith(parts: string[], prefix: string[]): boolean {
  return prefix.length > 0 && prefix.every((part, index) => parts[index] === part);
}

/**
 * A model name with a version names one model, which a snapshot or variant of
 * it extends (`claude-haiku-5-5-20261001`, `gemini-3-pro-preview`). One
 * without a version is an alias, such as `opus`, that the model's name contains.
 */
function sameModel(wanted: string[], ran: string[]): boolean {
  if (!wanted.some((part) => /\d/.test(part))) return wanted.length > 0 && wanted.every((part) => ran.includes(part));
  return startsWith(ran, wanted) || startsWith(wanted, ran);
}

/**
 * Whether a run's model isn't the one its runner was set to use. Harnesses name
 * a model their own way, so the requested model's name is looked for in each
 * `/`-separated part of the one that ran: a provider in front of it
 * (`opencode-go/kimi-k3`) or a variant after it (`kimi-k3/high`) still matches.
 * False when either is unknown.
 */
export function ranOtherModel(requested: string | null, ran: string | null): boolean {
  if (!requested?.trim() || !ran?.trim()) return false;
  const wanted = modelParts(requested.split("/").pop() ?? requested);
  return !ran.split("/").some((segment) => sameModel(wanted, modelParts(segment)));
}
