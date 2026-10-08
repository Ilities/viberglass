import type { EventProcessingResult, InboundEventContext, InboundEventProcessor } from "../InboundEventProcessorResolver";
import type { ParsedWebhookEvent, ProviderType } from "../WebhookProvider";
import type { TrackerContext, TrackerIssueInbound } from "../../services/trackers/TrackerIssueInbound";
import { takeBotMention } from "./trackers/botMention";
import { jiraBrowseUrl, jiraLabels, jiraPerson, jiraSeverity, jiraSiteUrl, jiraText } from "./trackers/jiraPayload";
import { field, recordAt, stringAt } from "./trackers/payloadFields";
import { NO_CONNECTION, trackerContext } from "./trackers/trackerContext";

/** How Jira writes a mention of an account: by account id on Cloud, by user name on Server, or as typed. */
function jiraMentionForms(botUsername: string | null): string[] {
  return botUsername ? [`[~accountid:${botUsername}]`, `[~${botUsername}]`, `@${botUsername}`] : [];
}

/** Reads Jira's issue and comment webhooks into a linked task's events. */
export class JiraInboundProcessor implements InboundEventProcessor {
  readonly provider: ProviderType | "default" = "jira";

  constructor(private readonly issues: Pick<TrackerIssueInbound, "issue" | "commented">) {}

  canProcess(event: ParsedWebhookEvent): boolean {
    return event.provider === "jira";
  }

  async process(context: InboundEventContext): Promise<EventProcessingResult> {
    const { event, config } = context;
    const tracker = trackerContext("jira", config);
    if (!tracker) return NO_CONNECTION;
    const issue = recordAt(event.payload, "issue");
    const fields = recordAt(issue, "fields");
    const key = stringAt(issue, "key");
    const self = stringAt(issue, "self");
    if (!key) return { ignoredReason: "The Jira event has no issue" };

    switch (event.eventType) {
      case "issue_created":
      case "issue_updated":
        return this.issues.issue(tracker, {
          key,
          url: jiraBrowseUrl(self, key),
          apiBaseUrl: jiraSiteUrl(self),
          title: stringAt(fields, "summary"),
          // An update that doesn't carry the description leaves it as it is.
          description: field(fields, "description") === undefined ? undefined : jiraText(fields?.description),
          author: event.eventType === "issue_created" ? (jiraPerson(recordAt(event.payload, "user")) ?? jiraPerson(recordAt(fields, "reporter"))) : null,
          severity: jiraSeverity(stringAt(recordAt(fields, "priority"), "name")),
          labels: jiraLabels(fields),
          repository: null,
          metadata: { issueType: stringAt(recordAt(fields, "issuetype"), "name"), jiraProjectKey: key.split("-")[0] },
        });
      case "comment_created":
        return this.comment(context, tracker, key);
      default:
        return { ignoredReason: `Unsupported Jira event '${event.eventType}'` };
    }
  }

  private async comment(context: InboundEventContext, tracker: TrackerContext, issueKey: string) {
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
