import { planParts } from "@viberglass/types";

describe("planParts", () => {
  it("reads each part's number, title and text, in the order they're written", () => {
    const plan = [
      "# Plan: gift note",
      "",
      "## What we found",
      "Checkout has three steps.",
      "",
      "## Part 1: Store the note",
      "1. Add `giftNote` to the order.",
      "",
      "## Part 2 — Show it on the slip",
      "1. Pass it to the warehouse.",
      "### Files",
      "- `slip.hbs`",
      "",
      "## How to test",
      "Order a gift.",
    ].join("\n");

    expect(planParts(plan)).toEqual([
      { number: 1, title: "Store the note", body: "1. Add `giftNote` to the order." },
      { number: 2, title: "Show it on the slip", body: "1. Pass it to the warehouse.\n### Files\n- `slip.hbs`" },
    ]);
  });

  it("takes a plan without parts as one part", () => {
    expect(planParts("# Plan\n\n1. Fix the rounding.\n")).toEqual([{ number: 1, title: null, body: "# Plan\n\n1. Fix the rounding." }]);
  });

  it("has no parts for an empty plan", () => {
    expect(planParts("  \n")).toEqual([]);
  });

  it("reads a part heading without a title, in any case", () => {
    expect(planParts("## part 3\nDo it.")).toEqual([{ number: 3, title: null, body: "Do it." }]);
  });

  it("ignores part headings inside code blocks", () => {
    const plan = "## Part 1: Docs\n```md\n## Part 2: not a part\n```\nDone.";
    expect(planParts(plan)).toEqual([{ number: 1, title: "Docs", body: "```md\n## Part 2: not a part\n```\nDone." }]);
  });

  it("doesn't take a heading that only starts with Part as a part", () => {
    expect(planParts("## Partial rollout\nLater.").map((part) => part.title)).toEqual([null]);
  });
});
