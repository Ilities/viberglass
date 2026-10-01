import { formatCommentsForAgent, SUGGESTION_PREFIX } from "../../../../services/comments/formatCommentsForAgent";

describe("formatCommentsForAgent", () => {
  it("says what text each comment is on, who wrote it and what it asks", () => {
    expect(
      formatCommentsForAgent([
        { lineNumber: 3, quote: { exact: "Shorten the\nbutton label", prefix: "", suffix: "" }, content: "Which button?", actor: "tomi@example.com" },
        { lineNumber: 4, quote: { exact: "short on mobile", prefix: "", suffix: "" }, content: `${SUGGESTION_PREFIX}short everywhere`, actor: null },
        { lineNumber: 7, quote: null, content: "Old line comment", actor: null },
      ]),
    ).toBe(
      [
        "- On “Shorten the button label” (line 3) (by tomi@example.com): Which button?",
        "- On “short on mobile” (line 4): **Suggestion:** replace it with “short everywhere”",
        "- Line 7: Old line comment",
      ].join("\n"),
    );
  });

  it("gives nothing when there are no open comments", () => {
    expect(formatCommentsForAgent([])).toBeUndefined();
  });
});
