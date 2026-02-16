import type { ParsedWebhookEvent } from "./WebhookProvider";
import type {
  WebhookConfig,
  WebhookConfigDAO,
} from "../persistence/webhook/WebhookConfigDAO";

export interface ResolveWebhookConfigOptions {
  providerName: WebhookConfig["provider"];
  configId?: string;
  integrationId?: string;
  providerProjectId?: string;
}

export class WebhookConfigResolver {
  constructor(private configDAO: WebhookConfigDAO) {}

  async resolveInboundConfig(
    event: ParsedWebhookEvent,
    options: ResolveWebhookConfigOptions,
  ): Promise<WebhookConfig | null> {
    const providerProjectIds = buildProviderProjectIdCandidates(
      options.providerProjectId,
      event,
    );

    if (options.configId) {
      const directConfig = await this.configDAO.getConfigById(options.configId);
      if (!directConfig) {
        return null;
      }

      if (directConfig.direction !== "inbound") {
        return null;
      }

      if (directConfig.provider !== options.providerName) {
        return null;
      }

      if (
        options.integrationId &&
        directConfig.integrationId !== options.integrationId
      ) {
        return null;
      }

      return directConfig;
    }

    if (options.integrationId) {
      const integrationConfigs = await this.configDAO.listByIntegrationId(
        options.integrationId,
        {
          direction: "inbound",
          activeOnly: false,
        },
      );
      const providerConfigs = integrationConfigs.filter(
        (config) => config.provider === options.providerName,
      );
      return selectDeterministicConfig(providerConfigs, providerProjectIds);
    }

    for (const providerProjectId of providerProjectIds) {
      const config = await this.configDAO.getActiveConfigByProviderProject(
        options.providerName,
        providerProjectId,
        "inbound",
      );
      if (config) {
        return config;
      }
    }

    if (event.metadata.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        event.metadata.projectId,
        50,
        0,
        "inbound",
      );
      const providerConfigs = projectConfigs.filter(
        (config) => config.provider === options.providerName,
      );
      return selectDeterministicConfig(providerConfigs, providerProjectIds);
    }

    return null;
  }

  async resolveActiveInboundConfigForProvider(
    provider: WebhookConfig["provider"],
  ): Promise<WebhookConfig | null> {
    const configs = await this.configDAO.listConfigsByProvider(
      provider,
      50,
      0,
      "inbound",
    );
    return configs.find((config) => config.active) ?? null;
  }

  async getConfigById(configId: string): Promise<WebhookConfig | null> {
    return this.configDAO.getConfigById(configId);
  }
}

function buildProviderProjectIdCandidates(
  explicitProviderProjectId: string | undefined,
  event: ParsedWebhookEvent,
): string[] {
  const candidates: string[] = [];
  const jiraIssueProjectKey = extractJiraProjectKeyFromIssue(event);

  for (const candidate of [
    explicitProviderProjectId,
    event.metadata.repositoryId,
    event.metadata.projectId,
    jiraIssueProjectKey,
    ...extractShortcutProviderProjectCandidates(event),
  ]) {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function extractJiraProjectKeyFromIssue(
  event: ParsedWebhookEvent,
): string | undefined {
  if (event.provider !== "jira" || !event.metadata.issueKey) {
    return undefined;
  }

  const separatorIndex = event.metadata.issueKey.indexOf("-");
  if (separatorIndex <= 0) {
    return undefined;
  }

  return event.metadata.issueKey.slice(0, separatorIndex);
}

function extractShortcutProviderProjectCandidates(
  event: ParsedWebhookEvent,
): string[] {
  if (event.provider !== "shortcut" || !isRecord(event.payload)) {
    return [];
  }

  const payload = event.payload;
  const data = isRecord(payload["data"]) ? payload["data"] : undefined;
  const refsRaw = payload["refs"];
  const refs = Array.isArray(refsRaw)
    ? refsRaw.filter((entry): entry is Record<string, unknown> =>
        isRecord(entry),
      )
    : [];

  const referencedStory = refs.find((ref) => ref["entity_type"] === "story");
  const candidates: Array<string | undefined> = [
    normalizeCandidate(event.metadata.issueKey),
    normalizeCandidate(data?.["project_id"]),
    normalizeCandidate(
      isRecord(data?.["project"]) ? data?.["project"]["id"] : undefined,
    ),
    normalizeCandidate(
      isRecord(data?.["project"]) ? data?.["project"]["name"] : undefined,
    ),
    normalizeCandidate(data?.["story_id"]),
    normalizeCandidate(data?.["id"]),
    normalizeCandidate(referencedStory?.["id"]),
  ];

  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

function normalizeCandidate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function selectDeterministicConfig(
  configs: WebhookConfig[],
  providerProjectIds: string[],
): WebhookConfig | null {
  if (configs.length === 0) {
    return null;
  }

  for (const providerProjectId of providerProjectIds) {
    const matches = configs.filter(
      (config) => config.providerProjectId === providerProjectId,
    );
    if (matches.length > 0) {
      return pickPreferredConfig(matches);
    }
  }

  return pickPreferredConfig(configs);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
