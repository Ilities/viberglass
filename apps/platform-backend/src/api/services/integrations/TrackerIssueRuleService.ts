import { TrackerIssueRuleDAO, type TrackerIssueRule } from "../../../persistence/trackers/TrackerIssueRuleDAO";
import { IntegrationWebhookContextResolver } from "./IntegrationWebhookContextResolver";
import { IntegrationRouteServiceError } from "./errors";

export interface TrackerIssueRuleInput {
  label?: string | null;
  planNewIssues?: boolean;
}

const MAX_LABEL_LENGTH = 255;

/** Which of a connection's issues a space takes, as the space's settings and the connection's screen show them. */
export class TrackerIssueRuleService {
  constructor(
    private readonly contextResolver: Pick<IntegrationWebhookContextResolver, "getIntegrationOrThrow" | "resolveContextOrThrow"> = new IntegrationWebhookContextResolver(),
    private readonly rules: Pick<TrackerIssueRuleDAO, "listForSpace" | "listForConnection" | "replaceForSpace"> = new TrackerIssueRuleDAO(),
  ) {}

  async listForSpace(projectId: string): Promise<TrackerIssueRule[]> {
    return this.rules.listForSpace(projectId);
  }

  async listForConnection(integrationId: string) {
    const integration = await this.contextResolver.getIntegrationOrThrow(integrationId);
    return this.rules.listForConnection(integration.id);
  }

  async replaceForSpace(projectId: string, integrationId: string, input: unknown): Promise<TrackerIssueRule[]> {
    const { integration, provider, providerPolicy } = await this.contextResolver.resolveContextOrThrow(
      integrationId,
      "The connection's issues can't come into a space",
    );
    if (providerPolicy.targetsOneSpace) {
      throw new IntegrationRouteServiceError(400, "The connection's issues can't come into a space");
    }
    const rules = parseRules(input, provider === "github");
    await this.rules.replaceForSpace(projectId, integration.id, rules);
    return (await this.rules.listForSpace(projectId)).filter((rule) => rule.integrationId === integration.id);
  }
}

/** One rule per label, ignoring case. Only a GitHub rule may leave the label empty, for every issue in the space's repository. */
function parseRules(input: unknown, labelOptional: boolean): Array<Pick<TrackerIssueRule, "label" | "planNewIssues">> {
  if (!Array.isArray(input)) throw new IntegrationRouteServiceError(400, "rules must be a list");
  const byLabel = new Map<string, Pick<TrackerIssueRule, "label" | "planNewIssues">>();
  for (const raw of input as TrackerIssueRuleInput[]) {
    const label = typeof raw?.label === "string" && raw.label.trim() ? raw.label.trim() : null;
    if (!label && !labelOptional) throw new IntegrationRouteServiceError(400, "Each rule needs a label");
    if (label && label.length > MAX_LABEL_LENGTH) throw new IntegrationRouteServiceError(400, `A label can be at most ${MAX_LABEL_LENGTH} characters`);
    byLabel.set(label?.toLowerCase() ?? "", { label, planNewIssues: raw?.planNewIssues === true });
  }
  return [...byLabel.values()];
}
