import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { githubLabels, githubSeverity, plansGitHubIssue } from "./trackers/githubIssuePolicy";
import { field, idAt, recordAt, stringAt } from "./trackers/payloadFields";
import { trackerContext } from "./trackers/trackerContext";

/** Reads GitHub's issue and issue-comment webhooks into a linked task's events. Issues are keyed "owner/repo#12". */
export class GitHubInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "github";

  constructor(private readonly issues: Pick<TrackerIssueInbound, "opened" | "edited" | "commented">) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "github";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const projectId = config.projectId || context.tenantId || context.defaultTenantId || "default";
    const tracker = trackerContext("github", projectId, config);
    const payload = event.payload;
    const action = stringAt(payload, "action") ?? event.metadata.action;
    const issue = recordAt(payload, "issue");
    const repository = stringAt(recordAt(payload, "repository"), "full_name");
    const number = idAt(issue, "number");
    if (!issue || !repository || !number) return { projectId, ignoredReason: "The GitHub event has no issue" };
    const key = `${repository}#${number}`;
    const kind = `${event.eventType.split(".")[0]}.${action ?? ""}`;

    switch (kind) {
      case "issues.opened": {
        const labels = githubLabels(issue);
        const result = await this.issues.opened(tracker, {
          key,
          url: stringAt(issue, "html_url") ?? null,
          apiBaseUrl: null,
          title: stringAt(issue, "title") ?? `Issue #${number}`,
          description: stringAt(issue, "body") ?? "",
          author: null,
          severity: githubSeverity(labels),
          plan: plansGitHubIssue(config.planNewIssues, config.labelMappings, labels),
          metadata: { repository },
        });
        return { projectId, ...result };
      }
      case "issues.edited": {
        const body = field(issue, "body");
        return { projectId, ...(await this.issues.edited(tracker, { key, title: stringAt(issue, "title"), description: typeof body === "string" ? body : undefined })) };
      }
      case "issue_comment.created":
        return { projectId, ...(await this.comment(context, tracker, key)) };
      default:
        return { projectId, ignoredReason: `Unsupported GitHub event '${kind}'` };
    }
  }

  private async comment(context: InboundEventContext, tracker: ReturnType<typeof trackerContext>, issueKey: string) {
    const comment = recordAt(context.event.payload, "comment");
    const user = recordAt(comment, "user");
    const login = stringAt(user, "login") ?? stringAt(recordAt(context.event.payload, "sender"), "login") ?? "someone";
    const bot = context.config.botUsername;
    if (stringAt(user, "type") === "Bot" || (bot && login.toLowerCase() === bot.toLowerCase())) {
      return { ignoredReason: "Written by a bot account" };
    }
    const { mentionsBot, body } = takeBotMention(stringAt(comment, "body") ?? "", bot ? [`@${bot}`] : []);
    return this.issues.commented(tracker, { issueKey, author: { name: login, email: null }, body, mentionsBot });
  }
}
