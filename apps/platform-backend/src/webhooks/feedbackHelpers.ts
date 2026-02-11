import type { WebhookConfig } from "../persistence/webhook/WebhookConfigDAO";
import type { JobResult } from "../types/Job";
import type { ProviderType } from "./WebhookProvider";

export interface OutboundTarget {
  config: WebhookConfig;
  externalTicketId?: string;
  providerProjectId?: string;
  apiBaseUrl?: string;
}

const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
]);

const JIRA_ISSUE_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/i;

export function requiresProviderProjectId(provider: ProviderType): boolean {
  return provider === "github" || provider === "jira";
}

export function resolveExternalTicketId(...candidates: Array<unknown>): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

export function resolveJiraIssueKey(...candidates: Array<unknown>): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      continue;
    }

    const text = toNonEmptyString(candidate);
    if (!text) {
      continue;
    }

    const normalizedDirect = normalizeJiraIssueKey(text);
    if (normalizedDirect) {
      return normalizedDirect;
    }

    const fromUrl = extractJiraIssueKeyFromUrl(text);
    if (fromUrl) {
      return fromUrl;
    }
  }

  return undefined;
}

export function resolveJiraApiBaseUrl(...candidates: Array<unknown>): string | undefined {
  for (const candidate of candidates) {
    const apiBaseUrl = normalizeJiraApiBaseUrl(candidate);
    if (apiBaseUrl) {
      return apiBaseUrl;
    }
  }

  return undefined;
}

export function buildProviderProjectCandidates(
  metadata: Record<string, unknown>,
  options: {
    inboundProviderProjectId?: string;
    jobRepository?: string;
  } = {},
): string[] {
  const candidates: string[] = [];

  for (const candidate of [
    toNonEmptyString(metadata.providerProjectId),
    toNonEmptyString(metadata.repository),
    toNonEmptyString(metadata.repositoryId),
    options.inboundProviderProjectId,
    options.jobRepository,
  ]) {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function filterConfigsByProvider(
  configs: WebhookConfig[],
  provider?: ProviderType,
): WebhookConfig[] {
  if (!provider) {
    return configs;
  }
  return configs.filter((config) => config.provider === provider);
}

export function createOutboundTarget(
  config: WebhookConfig,
  externalTicketId: string | undefined,
  providerProjectCandidates: string[],
  overrides?: { apiBaseUrl?: string },
): OutboundTarget {
  return {
    config,
    externalTicketId,
    providerProjectId: config.providerProjectId || providerProjectCandidates[0],
    apiBaseUrl: overrides?.apiBaseUrl,
  };
}

export function selectDeterministicConfig(
  configs: WebhookConfig[],
  providerProjectIds: string[],
): WebhookConfig | null {
  if (configs.length === 0) {
    return null;
  }

  for (const providerProjectId of providerProjectIds) {
    const match = configs.find((config) => config.providerProjectId === providerProjectId);
    if (match) {
      return match;
    }
  }

  return pickPreferredConfig(configs);
}

export function formatJobStartedComment(jobId: string, now: Date = new Date()): string {
  return [
    "## 🚀 Job Started",
    "",
    `**Job ID:** ${jobId}`,
    `**Started At:** ${now.toISOString()}`,
  ].join("\n");
}

export function formatResultDetails(result: JobResult): string {
  const parts: string[] = [];

  parts.push(`Success: ${result.success}`);

  if (result.executionTime) {
    parts.push(`Execution time: ${result.executionTime}ms`);
  }

  if (result.changedFiles && result.changedFiles.length > 0) {
    parts.push(`Files changed: ${result.changedFiles.length}`);
  }

  if (result.branch) {
    parts.push(`Branch: ${result.branch}`);
  }

  return parts.join("\n") || "Job completed";
}

export function isTransientProviderError(error: unknown): boolean {
  const candidate = error as {
    response?: { status?: number };
    request?: unknown;
    code?: string;
    message?: string;
  };

  const status = candidate.response?.status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }

  if (candidate.request) {
    return true;
  }

  if (candidate.code && TRANSIENT_NETWORK_ERROR_CODES.has(candidate.code.toUpperCase())) {
    return true;
  }

  const message = (candidate.message || "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    message.includes("econnaborted") ||
    message.includes("429") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

export function getRetryDelayMs(
  attempt: number,
  options: {
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {},
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  if (nodeEnv === "test") {
    return 0;
  }

  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 2000;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeJiraIssueKey(value: string): string | undefined {
  const match = value.match(JIRA_ISSUE_KEY_PATTERN);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1].toUpperCase();
}

function extractJiraIssueKeyFromUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const queryCandidates = [
    url.searchParams.get("selectedIssue"),
    url.searchParams.get("issueKey"),
    url.searchParams.get("key"),
  ];
  for (const queryCandidate of queryCandidates) {
    if (!queryCandidate) {
      continue;
    }
    const normalized = normalizeJiraIssueKey(queryCandidate);
    if (normalized) {
      return normalized;
    }
  }

  const segments = url.pathname.split("/").filter(Boolean);
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]?.toLowerCase();
    const nextSegment = segments[index + 1];
    if (
      (segment === "browse" || segment === "issue" || segment === "issues") &&
      nextSegment
    ) {
      const normalized = normalizeJiraIssueKey(nextSegment);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeJiraIssueKey(url.pathname);
}

function normalizeJiraApiBaseUrl(candidate: unknown): string | undefined {
  const raw = toNonEmptyString(candidate);
  if (!raw) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }

  const pathname = trimTrailingSlash(url.pathname);
  const restMatch = pathname.match(/^(.*)\/rest\/api\/([^/]+)(?:\/.*)?$/i);
  if (restMatch) {
    const contextPath = trimTrailingSlash(restMatch[1] || "");
    const apiVersion = restMatch[2];
    return `${url.origin}${contextPath}/rest/api/${apiVersion}`;
  }

  const browseMatch = pathname.match(/^(.*)\/browse\/[^/]+$/i);
  if (browseMatch) {
    const contextPath = trimTrailingSlash(browseMatch[1] || "");
    return `${url.origin}${contextPath}/rest/api/3`;
  }

  const contextPath = pathname === "/" ? "" : pathname;
  return `${url.origin}${contextPath}/rest/api/3`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function pickPreferredConfig(configs: WebhookConfig[]): WebhookConfig | null {
  if (configs.length === 0) {
    return null;
  }

  const sorted = [...configs].sort((a, b) => {
    if (a.active !== b.active) {
      return a.active ? -1 : 1;
    }

    const updatedAtDelta = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    const createdAtDelta = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return b.id.localeCompare(a.id);
  });

  return sorted[0];
}
