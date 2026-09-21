import { createHash } from "node:crypto";

/**
 * The run manifest — one record per job, enough to reproduce or re-grade it.
 *
 * It is written in two halves because the two halves are known in different
 * processes at different times, and because a job that dies in the worker must
 * still leave a record of what was dispatched:
 *
 *   - {@link DispatchManifest} — written by the backend at submit time.
 *   - {@link ExecutionManifest} — returned by the worker with its result.
 *
 * Nothing here is derived from a live database read at grading time. The point
 * is that a manifest stays true after the clanker is reconfigured, the prompt
 * template is edited, or the agent package is upgraded.
 */

export const RUN_MANIFEST_VERSION = 1;

/** Set by the backend when the job is dispatched. */
export interface DispatchManifest {
  manifestVersion: number;
  jobId: string;
  tenantId: string;
  jobKind: string;
  ticketId?: string;
  projectId?: string;
  clankerId?: string;
  /** Agent plugin id requested at dispatch — may differ from what ran. */
  requestedAgent?: string;
  repository: string;
  baseBranch?: string;
  workerType?: string;
  /** Container image the worker runs in, when the invoker knows it. */
  computeImage?: string;
  /**
   * Hash of the resolved job configuration (settings, overrides, project
   * worker settings). Config is compared across runs far more often than it is
   * read, and storing the whole thing per job would duplicate secrets.
   */
  configHash?: string;
  /** Hash of the instruction files materialised into the repo. */
  instructionsHash?: string;
  /** Credential names the worker was granted — names only, never values. */
  grantedCredentialNames?: string[];
  dispatchedAt: string;
}

/** Token usage. Absent fields mean the CLI did not report them. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningOutputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export type CostProvenance = "actual" | "estimated" | "unavailable";

/** Set by the worker and returned with the job result. */
export interface ExecutionManifest {
  manifestVersion: number;
  /** Agent plugin that actually ran. */
  agent?: string;
  /** Version of the agent CLI, as reported by the harness. */
  harnessVersion?: string;
  /** Model the CLI reported using. Null when it does not say. */
  modelSnapshot?: string;
  /** Commit the repository was at before the agent ran. */
  baseSha?: string;
  /** Commit the agent produced, if it committed. */
  commitSha?: string;
  branch?: string;
  pullRequestUrl?: string;
  changedFileCount?: number;
  /** Hash of the fully-assembled prompt. */
  promptHash?: string;
  promptCharacters?: number;
  /**
   * Tool permissions the agent ran under, when the harness exposes them.
   * Empty array and undefined mean different things: "ran with none" vs "the
   * harness does not tell us".
   */
  toolPermissions?: string[];
  usage?: TokenUsage;
  /**
   * False when the CLI exposes no usage data at all.
   *
   */
  usageAvailable: boolean;
  costUsd?: number;
  costProvenance: CostProvenance;
  /** Why the run ended: completed, failed, timeout, needs_input, … */
  stopReason?: string;
  success: boolean;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  /**
   * Version of the grader that scored this run.
   */
  graderVersion?: string;
}

export interface RunManifest extends DispatchManifest {
  execution?: ExecutionManifest;
}

/**
 * Stable hash of an arbitrary config object.
 *
 * Object keys are sorted recursively before hashing, so two runs with the same
 * effective configuration hash identically regardless of property order —
 * otherwise "did the config change between these runs?" gives false positives.
 */
export function hashConfig(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Hash of a prompt string. The prompt itself is deliberately not persisted here. */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

export const REDACTED = "[REDACTED]";

/**
 * Replaces known secret values anywhere in a structure before it is persisted.
 *
 * Manifests are assembled from payload-shaped objects that have, at various
 * points in this codebase's history, carried tokens inline. This is a
 * belt-and-braces pass over the *values* we already hold — it cannot catch a
 * credential we were never told about, so it complements rather than replaces
 * not putting secrets in the manifest in the first place.
 *
 * Short values are skipped: a two-character secret would redact half the
 * English language out of the manifest.
 */
const MIN_REDACTABLE_SECRET_LENGTH = 8;

export function redactSecrets<T>(value: T, secretValues: Iterable<string>): T {
  const secrets = [...secretValues].filter(
    (secret) =>
      typeof secret === "string" && secret.length >= MIN_REDACTABLE_SECRET_LENGTH,
  );
  if (secrets.length === 0) return value;
  return redactNode(value, secrets) as T;
}

function redactNode(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") {
    let result = value;
    for (const secret of secrets) {
      if (result.includes(secret)) {
        result = result.split(secret).join(REDACTED);
      }
    }
    return result;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item, secrets));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = redactNode(entry, secrets);
    }
    return result;
  }
  return value;
}
