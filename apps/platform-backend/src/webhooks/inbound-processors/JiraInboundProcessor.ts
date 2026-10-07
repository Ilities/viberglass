import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { jiraBrowseUrl, jiraPerson, jiraSeverity, jiraSiteUrl, jiraText } from "./trackers/jiraPayload";
import { field, recordAt, stringAt } from "./trackers/payloadFields";
import { trackerContext } from "./trackers/trackerContext";

/** How Jira writes a mention of an account: by account id on Cloud, by user name on Server, or as typed. */
function jiraMentionForms(botUsername: string | null): string[] {
  return botUsername ? [`[~accountid:${botUsername}]`, `[~${botUsername}]`, `@${botUsername}`] : [];
}

/** Reads Jira's issue and comment webhooks into a linked task's events. */
export class JiraInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "jira";

  constructor(private readonly issues: Pick<TrackerIssueInbound, "opened" | "edited" | "commented">) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "jira";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const projectId = config.projectId || context.tenantId || context.defaultTenantId || "default";
    const tracker = trackerContext("jira", projectId, config);
    const issue = recordAt(event.payload, "issue");
    const fields = recordAt(issue, "fields");
    const key = stringAt(issue, "key");
    const self = stringAt(issue, "self");
    if (!key) return { projectId, ignoredReason: "The Jira event has no issue" };

    switch (event.eventType) {
      case "issue_created": {
        const title = stringAt(fields, "summary");
        if (!title) return { projectId, ignoredReason: `The Jira issue '${key}' has no summary` };
        const result = await this.issues.opened(tracker, {
          key,
          url: jiraBrowseUrl(self, key),
          apiBaseUrl: jiraSiteUrl(self),
          title,
          description: jiraText(fields?.description),
          author: jiraPerson(recordAt(event.payload, "user")) ?? jiraPerson(recordAt(fields, "reporter")),
          severity: jiraSeverity(stringAt(recordAt(fields, "priority"), "name")),
          plan: config.planNewIssues,
          metadata: { issueType: stringAt(recordAt(fields, "issuetype"), "name"), jiraProjectKey: key.split("-")[0] },
        });
        return { projectId, ...result };
      }
      case "issue_updated": {
        // An update that doesn't carry the description leaves it as it is.
        const description = field(fields, "description") === undefined ? undefined : jiraText(fields?.description);
        return { projectId, ...(await this.issues.edited(tracker, { key, title: stringAt(fields, "summary"), description })) };
      }
      case "comment_created":
        return { projectId, ...(await this.comment(context, tracker, key)) };
      default:
        return { projectId, ignoredReason: `Unsupported Jira event '${event.eventType}'` };
    }
  }

  private async comment(context: InboundEventContext, tracker: ReturnType<typeof trackerContext>, issueKey: string) {
    const { event, config } = context;
    // An issue update about a comment repeats the comment's own event.
    if (event.metadata.action === "issue_commented") return { ignoredReason: "The comment arrives as its own event" };
    const comment = recordAt(event.payload, "comment");
    const author = recordAt(comment, "author");
    const bot = config.botUsername;
    if (bot && [stringAt(author, "accountId"), stringAt(author, "name"), stringAt(author, "emailAddress")].includes(bot)) {
      return { ignoredReason: "Written by the bot account" };
    }
    const { mentionsBot, body } = takeBotMention(jiraText(comment?.body), jiraMentionForms(bot));
    return this.issues.commented(tracker, {
      issueKey,
      author: jiraPerson(author) ?? { name: "Someone", email: null },
      body,
      mentionsBot,
    });
  }
}
