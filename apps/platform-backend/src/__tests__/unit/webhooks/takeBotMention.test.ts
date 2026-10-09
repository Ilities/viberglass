import { takeBotMention } from "@viberglass/integration-core";

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
