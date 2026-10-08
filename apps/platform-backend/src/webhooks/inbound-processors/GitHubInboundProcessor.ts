import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TrackerContext, TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { githubLabels, githubSeverity } from "./trackers/githubIssuePolicy";
import { field, idAt, recordAt, stringAt } from "./trackers/payloadFields";
import { NO_CONNECTION, trackerContext } from "./trackers/trackerContext";

/** Issue events that show the issue as it now is. */
const ISSUE_ACTIONS = new Set(["opened", "edited", "labeled"]);

/** Reads GitHub's issue and issue-comment webhooks into a linked task's events. Issues are keyed "owner/repo#12". */
export class GitHubInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "github";

  constructor(private readonly issues: Pick<TrackerIssueInbound, "issue" | "commented">) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "github";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const tracker = trackerContext("github", config);
    if (!tracker) return NO_CONNECTION;
    const payload = event.payload;
    const action = stringAt(payload, "action") ?? event.metadata.action;
    const issue = recordAt(payload, "issue");
    const repository = stringAt(recordAt(payload, "repository"), "full_name");
    const number = idAt(issue, "number");
    if (!issue || !repository || !number) return { ignoredReason: "The GitHub event has no issue" };
    const key = `${repository}#${number}`;
    const eventName = event.eventType.split(".")[0];

    if (eventName === "issues" && action && ISSUE_ACTIONS.has(action)) {
      const labels = githubLabels(issue);
      const body = field(issue, "body");
      return this.issues.issue(tracker, {
        key,
        url: stringAt(issue, "html_url") ?? null,
        apiBaseUrl: null,
        title: stringAt(issue, "title"),
        description: typeof body === "string" ? body : body === null ? "" : undefined,
        author: null,
        severity: githubSeverity(labels),
        labels,
        repository,
        metadata: { repository },
      });
    }
    if (eventName === "issue_comment" && action === "created") return this.comment(context, tracker, key);
    return { ignoredReason: `Unsupported GitHub event '${eventName}.${action ?? ""}'` };
  }

  private async comment(context: InboundEventContext, tracker: TrackerContext, issueKey: string) {
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
