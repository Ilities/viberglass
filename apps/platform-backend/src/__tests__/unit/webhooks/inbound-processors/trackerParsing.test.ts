import { takeBotMention } from "../../../../webhooks/inbound-processors/trackers/botMention";
import { plansGitHubIssue } from "../../../../webhooks/inbound-processors/trackers/githubIssuePolicy";
import { jiraBrowseUrl, jiraSiteUrl, jiraText } from "../../../../webhooks/inbound-processors/trackers/jiraPayload";

describe("takeBotMention", () => {
  it("finds the bot's mention and takes it out of the comment", () => {
    expect(takeBotMention("@viberator, can you write the plan?", ["@viberator"])).toEqual({ mentionsBot: true, body: "can you write the plan?" });
    expect(takeBotMention("Thanks [~accountid:abc-123] for this", ["[~accountid:abc-123]"])).toEqual({ mentionsBot: true, body: "Thanks for this" });
  });

  it("doesn't mistake a longer name for the bot, or a comment without a mention", () => {
    expect(takeBotMention("@viberatorfan agrees", ["@viberator"])).toEqual({ mentionsBot: false, body: "@viberatorfan agrees" });
    expect(takeBotMention("Looks good", ["@viberator"]).mentionsBot).toBe(false);
    expect(takeBotMention("@viberator hi", []).mentionsBot).toBe(false);
  });
});

describe("Jira payloads", () => {
  it("reads rich text as paragraphs, lists and code", () => {
    const description = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Login fails " }, { type: "mention", attrs: { text: "@Maria" } }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "after reset" }] }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "500 Internal" }] },
      ],
    };
    expect(jiraText(description)).toBe("Login fails @Maria\n\n- after reset\n\n```\n500 Internal\n```");
    expect(jiraText("  *wiki* text ")).toBe("*wiki* text");
    expect(jiraText(null)).toBe("");
  });

  it("finds the site and the issue's page from its API link", () => {
    const self = "https://acme.atlassian.net/rest/api/2/issue/10001";
    expect(jiraSiteUrl(self)).toBe("https://acme.atlassian.net");
    expect(jiraBrowseUrl(self, "OPS-1")).toBe("https://acme.atlassian.net/browse/OPS-1");
    expect(jiraSiteUrl("https://jira.acme.com/jira/rest/api/2/issue/1")).toBe("https://jira.acme.com/jira");
    expect(jiraSiteUrl(undefined)).toBeNull();
  });
});

describe("plansGitHubIssue", () => {
  it("plans every new issue, or with label gating only those with a listed label", () => {
    expect(plansGitHubIssue(false, {}, ["bug"])).toBe(false);
    expect(plansGitHubIssue(true, {}, [])).toBe(true);
    const gated = { github: { planNewIssuesMode: "label_gated", requiredLabels: ["AI-Plan"] } };
    expect(plansGitHubIssue(true, gated, ["bug"])).toBe(false);
    expect(plansGitHubIssue(true, gated, ["ai-plan"])).toBe(true);
  });
});
