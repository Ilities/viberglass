import { takeBotMention } from "../../../../webhooks/inbound-processors/trackers/botMention";
import { jiraLabels } from "../../../../webhooks/inbound-processors/trackers/jiraPayload";
import { shortcutLabels } from "../../../../webhooks/inbound-processors/trackers/shortcutLabels";
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

describe("issue labels", () => {
  it("reads Jira's labels, lower-cased", () => {
    expect(jiraLabels({ labels: ["Frontend", " ui ", ""] })).toEqual(["frontend", "ui"]);
    expect(jiraLabels({})).toEqual([]);
  });

  it("names a Shortcut story's labels from the event's references", () => {
    const refs = [
      { id: 7, entity_type: "label", name: "Frontend" },
      { id: 8, entity_type: "label", name: "ops" },
      { id: 9, entity_type: "workflow-state", name: "Done" },
    ];
    expect(shortcutLabels({ data: { label_ids: [7, 8] }, refs })).toEqual(["frontend", "ops"]);
    expect(shortcutLabels({ data: { label_ids: { adds: [8], removes: [7] } }, refs })).toEqual(["ops"]);
    expect(shortcutLabels({ data: { labels: [{ id: 3, name: "Bug" }] } })).toEqual(["bug"]);
  });
});
