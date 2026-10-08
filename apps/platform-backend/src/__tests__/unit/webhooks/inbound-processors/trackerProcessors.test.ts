import { GitHubInboundProcessor } from "../../../../webhooks/inbound-processors/GitHubInboundProcessor";
import { JiraInboundProcessor } from "../../../../webhooks/inbound-processors/JiraInboundProcessor";
import { ShortcutInboundProcessor } from "../../../../webhooks/inbound-processors/ShortcutInboundProcessor";
import type { InboundEventContext } from "../../../../webhooks/InboundEventProcessorResolver";
import type { ParsedWebhookEvent } from "../../../../webhooks/WebhookProvider";
import type { WebhookConfig } from "../../../../persistence/webhook/WebhookConfigDAO";

function issues() {
  return {
    issue: jest.fn().mockResolvedValue({ ticketId: "t-1" }),
    commented: jest.fn().mockResolvedValue({ ticketId: "t-1" }),
  };
}

function context(provider: WebhookConfig["provider"], event: Omit<ParsedWebhookEvent, "provider" | "deduplicationId" | "timestamp">, botUsername: string | null = "viberator"): InboundEventContext {
  const at = new Date("2026-10-07T00:00:00Z");
  return {
    event: { provider, deduplicationId: "d-1", timestamp: at.toISOString(), ...event },
    config: {
      id: "cfg-1",
      projectId: null,
      provider,
      integrationId: "int-1",
      secretLocation: "database",
      secretPath: null,
      webhookSecretEncrypted: null,
      allowedEvents: ["*"],
      planNewIssues: false,
      botUsername,
      active: true,
      createdAt: at,
      updatedAt: at,
    },
  };
}

describe("tracker inbound processors", () => {
  it("passes a Jira comment on as a message, with the commenter's email to match them", async () => {
    const inbound = issues();
    await new JiraInboundProcessor(inbound).process(
      context("jira", {
        eventType: "comment_created",
        metadata: {},
        payload: {
          issue: { key: "OPS-1" },
          comment: { body: "Can we keep the old flow?", author: { displayName: "Maria", emailAddress: "maria@acme.test", accountId: "u-1" } },
        },
      }),
    );
    expect(inbound.commented).toHaveBeenCalledWith(
      { provider: "jira", integrationId: "int-1", webhookConfigId: "cfg-1" },
      { issueKey: "OPS-1", author: { name: "Maria", email: "maria@acme.test" }, body: "Can we keep the old flow?", mentionsBot: false },
    );
  });

  it("leaves out Jira's repeat of a comment as an issue update, and the bot's own comments", async () => {
    const inbound = issues();
    const processor = new JiraInboundProcessor(inbound);
    const repeat = await processor.process(
      context("jira", { eventType: "comment_created", metadata: { action: "issue_commented" }, payload: { issue: { key: "OPS-1" }, comment: { body: "Hi" } } }),
    );
    const own = await processor.process(
      context("jira", { eventType: "comment_created", metadata: {}, payload: { issue: { key: "OPS-1" }, comment: { body: "Plan ready", author: { accountId: "viberator" } } } }),
    );
    expect(repeat.ignoredReason).toBeDefined();
    expect(own.ignoredReason).toBe("Written by the bot account");
    expect(inbound.commented).not.toHaveBeenCalled();
  });

  it("asks from a Shortcut comment that mentions the bot", async () => {
    const inbound = issues();
    await new ShortcutInboundProcessor(inbound).process(
      context("shortcut", { eventType: "comment_created", metadata: {}, payload: { data: { story_id: 42, text: "@viberator write the plan", author_id: "m-1" } } }),
    );
    expect(inbound.commented).toHaveBeenCalledWith(expect.objectContaining({ provider: "shortcut" }), {
      issueKey: "42",
      author: { name: "A Shortcut member", email: null },
      body: "write the plan",
      mentionsBot: true,
    });
  });

  it("passes a GitHub issue on with its repository and labels, and skips comments from bots", async () => {
    const inbound = issues();
    const processor = new GitHubInboundProcessor(inbound);
    const repository = { full_name: "acme/shop" };
    await processor.process(
      context("github", {
        eventType: "issues",
        metadata: {},
        payload: { action: "labeled", repository, issue: { number: 7, title: "New title", body: "New body", labels: [{ name: "Ready" }] } },
      }),
    );
    const bot = await processor.process(
      context("github", {
        eventType: "issue_comment",
        metadata: {},
        payload: { action: "created", repository, issue: { number: 7 }, comment: { body: "Ship it", user: { login: "ci", type: "Bot" } } },
      }),
    );
    expect(inbound.issue).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "github" }),
      expect.objectContaining({ key: "acme/shop#7", title: "New title", description: "New body", labels: ["ready"], repository: "acme/shop" }),
    );
    expect(bot.ignoredReason).toBe("Written by a bot account");
    expect(inbound.commented).not.toHaveBeenCalled();
  });

  it("passes a Jira issue on with its labels, and keeps the description an update doesn't carry", async () => {
    const inbound = issues();
    const processor = new JiraInboundProcessor(inbound);
    const issue = { key: "OPS-1", self: "https://acme.atlassian.net/rest/api/2/issue/1", fields: { summary: "Faster checkout", labels: ["Frontend"] } };
    await processor.process(context("jira", { eventType: "issue_updated", metadata: {}, payload: { issue } }));
    expect(inbound.issue).toHaveBeenCalledWith(
      { provider: "jira", integrationId: "int-1", webhookConfigId: "cfg-1" },
      expect.objectContaining({ key: "OPS-1", title: "Faster checkout", description: undefined, labels: ["frontend"], url: "https://acme.atlassian.net/browse/OPS-1" }),
    );
  });

  it("ignores events of a webhook that has lost its connection", async () => {
    const inbound = issues();
    const lost = context("jira", { eventType: "issue_created", metadata: {}, payload: { issue: { key: "OPS-1" } } });
    const result = await new JiraInboundProcessor(inbound).process({ ...lost, config: { ...lost.config, integrationId: null } });
    expect(result.ignoredReason).toBeDefined();
    expect(inbound.issue).not.toHaveBeenCalled();
  });
});
