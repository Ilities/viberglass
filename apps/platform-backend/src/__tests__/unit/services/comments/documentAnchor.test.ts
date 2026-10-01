import { lineAt, locateQuote, quoteAt, quoteForLine } from "@viberglass/types";

const PLAN = "# Plan\n\n1. Shorten the button label.\n2. Keep the button label short on mobile.\n";

describe("document anchors (W3C text quote)", () => {
  it("quotes a stretch of the source with context either side", () => {
    const start = PLAN.indexOf("button label");
    expect(quoteAt(PLAN, start, start + "button label".length)).toEqual({
      exact: "button label",
      prefix: "# Plan\n\n1. Shorten the ",
      suffix: ".\n2. Keep the button label short",
    });
  });

  it("finds the quote again after the document changes around it", () => {
    const start = PLAN.indexOf("Shorten");
    const quote = quoteAt(PLAN, start, start + "Shorten the button label".length);
    const revised = "# Plan\n\nContext first.\n\n1. Shorten the button label.\n";
    expect(locateQuote(revised, quote)).toEqual({ start: revised.indexOf("Shorten"), end: revised.indexOf("Shorten") + 24, line: 5 });
  });

  it("tells repeated text apart by its context", () => {
    const second = PLAN.lastIndexOf("button label");
    const quote = quoteAt(PLAN, second, second + "button label".length);
    expect(locateQuote(PLAN, quote)?.start).toBe(second);
    const first = PLAN.indexOf("button label");
    expect(locateQuote(PLAN, quoteAt(PLAN, first, first + "button label".length))?.start).toBe(first);
  });

  it("prefers the match nearest the original line when the context doesn't decide", () => {
    const source = "same\nother\nsame\n";
    expect(locateQuote(source, { exact: "same", prefix: "", suffix: "" }, 3)?.line).toBe(3);
  });

  it("finds nothing once the quoted text is gone, so the comment shows as outdated", () => {
    expect(locateQuote("# Plan\n\n1. Rewrite the copy.\n", { exact: "Shorten the button label", prefix: "", suffix: "" })).toBeNull();
    expect(locateQuote(PLAN, { exact: "", prefix: "", suffix: "" })).toBeNull();
  });

  it("quotes a whole line for comments placed by line number, but not a blank one", () => {
    expect(quoteForLine(PLAN, 3)?.exact).toBe("1. Shorten the button label.");
    expect(quoteForLine(PLAN, 2)).toBeNull();
    expect(quoteForLine(PLAN, 99)).toBeNull();
    expect(lineAt(PLAN, PLAN.indexOf("2. Keep"))).toBe(4);
  });
});
