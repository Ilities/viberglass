import type { Severity } from "@viberglass/types";
import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { ProjectIntegrationLinkDAO } from "../../persistence/integrations";
import type { TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { idAt, recordAt, stringAt } from "./trackers/payloadFields";
import { trackerContext } from "./trackers/trackerContext";

const SEVERITY_OF_STORY_TYPE: Record<string, Severity> = { bug: "high", feature: "medium", chore: "low" };

/** Reads Shortcut's story and comment webhooks into a linked task's events. */
export class ShortcutInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "shortcut";

  constructor(
    private readonly issues: Pick<TrackerIssueInbound, "opened" | "edited" | "commented">,
    private readonly projectLinks: Pick<ProjectIntegrationLinkDAO, "getIntegrationProjects">,
  ) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "shortcut";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const projectId = await this.resolveProjectId(context);
    const tracker = trackerContext("shortcut", projectId, config);
    const data = recordAt(event.payload, "data");

    switch (event.eventType) {
      case "story_created": {
        const key = idAt(data, "id");
        const title = stringAt(data, "name");
        if (!key || !title) return { projectId, ignoredReason: "The Shortcut story has no id or name" };
        const storyType = stringAt(data, "story_type") ?? "feature";
        const result = await this.issues.opened(tracker, {
          key,
          url: stringAt(data, "app_url") ?? null,
          apiBaseUrl: null,
          title,
          description: stringAt(data, "description") ?? "",
          author: null,
          severity: SEVERITY_OF_STORY_TYPE[storyType] ?? "medium",
          plan: config.planNewIssues,
          metadata: { storyType, shortcutProjectId: idAt(data, "project_id"), workflowState: stringAt(recordAt(data, "workflow_state"), "name") },
        });
        return { projectId, ...result };
      }
      case "story_updated": {
        const key = idAt(data, "id");
        if (!key) return { projectId, ignoredReason: "The Shortcut story has no id" };
        const description = data?.description;
        return {
          projectId,
          ...(await this.issues.edited(tracker, {
            key,
            title: stringAt(data, "name"),
            description: typeof description === "string" ? description : undefined,
          })),
        };
      }
      case "comment_created": {
        const issueKey = idAt(data, "story_id");
        if (!issueKey) return { projectId, ignoredReason: "The Shortcut comment has no story" };
        const bot = config.botUsername;
        const { mentionsBot, body } = takeBotMention(stringAt(data, "text") ?? "", bot ? [`@${bot}`] : []);
        // Shortcut's comment events name the author only by member id.
        const name = stringAt(data, "author_name") ?? "A Shortcut member";
        return { projectId, ...(await this.issues.commented(tracker, { issueKey, author: { name, email: null }, body, mentionsBot })) };
      }
      default:
        return { projectId, ignoredReason: `Unsupported Shortcut event '${event.eventType}'` };
    }
  }

  /** The configured space, else the request's, else the first space the connection is linked to. */
  private async resolveProjectId(context: InboundEventContext): Promise<string> {
    const { config, tenantId, defaultTenantId } = context;
    if (config.projectId) return config.projectId;
    if (tenantId) return tenantId;
    if (config.integrationId) {
      const linked = (await this.projectLinks.getIntegrationProjects(config.integrationId))[0]?.projectId;
      if (linked) return linked;
    }
    if (defaultTenantId && defaultTenantId !== "default") return defaultTenantId;
    throw new Error("No project linked to this webhook configuration");
  }
}
