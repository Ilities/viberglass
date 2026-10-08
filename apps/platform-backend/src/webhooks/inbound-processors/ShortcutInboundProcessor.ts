import type { Severity } from "@viberglass/types";
import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { idAt, recordAt, stringAt } from "./trackers/payloadFields";
import { shortcutLabels } from "./trackers/shortcutLabels";
import { NO_CONNECTION, trackerContext } from "./trackers/trackerContext";

const SEVERITY_OF_STORY_TYPE: Record<string, Severity> = { bug: "high", feature: "medium", chore: "low" };

/** Reads Shortcut's story and comment webhooks into a linked task's events. */
export class ShortcutInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "shortcut";

  constructor(private readonly issues: Pick<TrackerIssueInbound, "issue" | "commented">) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "shortcut";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const tracker = trackerContext("shortcut", config);
    if (!tracker) return NO_CONNECTION;
    const data = recordAt(event.payload, "data");

    switch (event.eventType) {
      case "story_created":
      case "story_updated": {
        const key = idAt(data, "id");
        if (!key) return { ignoredReason: "The Shortcut story has no id" };
        const storyType = stringAt(data, "story_type") ?? "feature";
        const description = data?.description;
        return this.issues.issue(tracker, {
          key,
          url: stringAt(data, "app_url") ?? null,
          apiBaseUrl: null,
          title: stringAt(data, "name"),
          description: typeof description === "string" ? description : undefined,
          author: null,
          severity: SEVERITY_OF_STORY_TYPE[storyType] ?? "medium",
          labels: shortcutLabels(event.payload),
          repository: null,
          metadata: { storyType, shortcutProjectId: idAt(data, "project_id"), workflowState: stringAt(recordAt(data, "workflow_state"), "name") },
        });
      }
      case "comment_created": {
        const issueKey = idAt(data, "story_id");
        if (!issueKey) return { ignoredReason: "The Shortcut comment has no story" };
        const bot = config.botUsername;
        const { mentionsBot, body } = takeBotMention(stringAt(data, "text") ?? "", bot ? [`@${bot}`] : []);
        // Shortcut's comment events name the author only by member id.
        const name = stringAt(data, "author_name") ?? "A Shortcut member";
        return this.issues.commented(tracker, { issueKey, author: { name, email: null }, body, mentionsBot });
      }
      default:
        return { ignoredReason: `Unsupported Shortcut event '${event.eventType}'` };
    }
  }
}
