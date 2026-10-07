import { GitHubInboundProcessor } from "../../../../webhooks/inbound-processors/GitHubInboundProcessor";
import { JiraInboundProcessor } from "../../../../webhooks/inbound-processors/JiraInboundProcessor";
import { ShortcutInboundProcessor } from "../../../../webhooks/inbound-processors/ShortcutInboundProcessor";
import type { InboundEventContext } from "../../../../webhooks/InboundEventProcessorResolver";
import type { ParsedWebhookEvent } from "../../../../webhooks/WebhookProvider";
import type { WebhookConfig } from "../../../../persistence/webhook/WebhookConfigDAO";

function issues() {
  return {
    opened: jest.fn().mockResolvedValue({ ticketId: "t-1" }),
    edited: jest.fn().mockResolvedValue({ ticketId: "t-1" }),
    commented: jest.fn().mockResolvedValue({ ticketId: "t-1" }),
  };
}

function context(provider: WebhookConfig["provider"], event: Omit<ParsedWebhookEvent, "provider" | "deduplicationId" | "timestamp">, botUsername: string | null = "viberator"): InboundEventContext {
  const at = new Date("2026-10-07T00:00:00Z");
  return {
    event: { provider, deduplicationId: "d-1", timestamp: at.toISOString(), ...event },
    config: {
      id: "cfg-1",
      projectId: "space-1",
      provider,
      providerProjectId: null,
      integrationId: "int-1",
      secretLocation: "database",
      secretPath: null,
      webhookSecretEncrypted: null,
      allowedEvents: ["*"],
      planNewIssues: false,
      botUsername,
      labelMappings: {},
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
      { provider: "jira", projectId: "space-1", integrationId: "int-1", webhookConfigId: "cfg-1" },
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
    await new ShortcutInboundProcessor(inbound, { getIntegrationProjects: jest.fn() }).process(
      context("shortcut", { eventType: "comment_created", metadata: {}, payload: { data: { story_id: 42, text: "@viberator write the plan", author_id: "m-1" } } }),
    );
    expect(inbound.commented).toHaveBeenCalledWith(expect.objectContaining({ provider: "shortcut" }), {
      issueKey: "42",
      author: { name: "A Shortcut member", email: null },
      body: "write the plan",
      mentionsBot: true,
    });
  });

  it("updates a GitHub issue's task when it's edited, and skips comments from bots", async () => {
    const inbound = issues();
    const processor = new GitHubInboundProcessor(inbound);
    const repository = { full_name: "acme/shop" };
    await processor.process(
      context("github", { eventType: "issues", metadata: {}, payload: { action: "edited", repository, issue: { number: 7, title: "New title", body: "New body" } } }),
    );
    const bot = await processor.process(
      context("github", {
        eventType: "issue_comment",
        metadata: {},
        payload: { action: "created", repository, issue: { number: 7 }, comment: { body: "Ship it", user: { login: "ci", type: "Bot" } } },
      }),
    );
    expect(inbound.edited).toHaveBeenCalledWith(expect.objectContaining({ provider: "github" }), { key: "acme/shop#7", title: "New title", description: "New body" });
    expect(bot.ignoredReason).toBe("Written by a bot account");
    expect(inbound.commented).not.toHaveBeenCalled();
  });
});
