import { IntegrationRouteServiceError } from "./errors";
import { DefaultIntegrationWebhookProviderPolicy } from "./DefaultIntegrationWebhookProviderPolicy";

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS = "matching_events";
const GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED = "label_gated";

type GitHubAutoExecuteMode =
  | typeof GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS
  | typeof GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED;

export class GitHubIntegrationWebhookProviderPolicy extends DefaultIntegrationWebhookProviderPolicy {
  constructor() {
    super("github", {
      providerLabel: "GitHub",
      alwaysOnOutboundEvents: true,
    });
  }

  override validateProviderProjectId(providerProjectId: string | null): void {
    if (!providerProjectId) {
      return;
    }

    if (!GITHUB_REPOSITORY_PATTERN.test(providerProjectId)) {
      throw new IntegrationRouteServiceError(
        400,
        'GitHub repository mapping must use "owner/repo" format',
      );
    }
  }

  override normalizeInboundLabelMappings(
    inputLabelMappings: { [key: string]: unknown } | undefined,
    existingLabelMappings?: { [key: string]: unknown },
  ): { [key: string]: unknown } {
    if (inputLabelMappings === undefined) {
      return existingLabelMappings || {};
    }

    const normalizedInput = this.normalizeRecord(inputLabelMappings);
    if (!normalizedInput) {
      return {};
    }

    const mode = this.parseGitHubAutoExecuteMode(normalizedInput);
    if (!mode) {
      return {};
    }

    if (mode === GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS) {
      return {
        github: {
          autoExecuteMode: GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS,
        },
      };
    }

    const nested = this.normalizeRecord(normalizedInput.github);
    const source = nested || normalizedInput;
    const labels = this.normalizeLabelArray(
      source.requiredLabels ?? source.labels,
    );
    if (labels.length === 0) {
      throw new IntegrationRouteServiceError(
        400,
        "GitHub label-gated auto-execute requires at least one label",
      );
    }

    return {
      github: {
        autoExecuteMode: GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED,
        requiredLabels: labels,
      },
    };
  }

  private parseGitHubAutoExecuteMode(labelMappings: {
    [key: string]: unknown;
  }): GitHubAutoExecuteMode | undefined {
    const root = this.normalizeRecord(labelMappings);
    const nested = this.normalizeRecord(root?.github);
    const source = nested || root;
    if (!source) {
      return undefined;
    }

    const rawMode = source.autoExecuteMode ?? source.mode;
    if (typeof rawMode !== "string") {
      return undefined;
    }

    const normalizedMode = rawMode.trim().toLowerCase();
    if (normalizedMode === GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS) {
      return GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS;
    }
    if (normalizedMode === GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED) {
      return GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED;
    }

    throw new IntegrationRouteServiceError(
      400,
      `GitHub auto-execute mode must be "${GITHUB_AUTO_EXECUTE_MODE_MATCHING_EVENTS}" or "${GITHUB_AUTO_EXECUTE_MODE_LABEL_GATED}"`,
    );
  }

  private normalizeLabelArray(rawLabels: unknown): string[] {
    if (!Array.isArray(rawLabels)) {
      return [];
    }

    const labels: string[] = [];
    for (const rawLabel of rawLabels) {
      if (typeof rawLabel !== "string") {
        continue;
      }

      const normalized = rawLabel.trim().toLowerCase();
      if (!normalized || labels.includes(normalized)) {
        continue;
      }
      labels.push(normalized);
    }

    return labels;
  }
}
