import { artifactCover } from "../../../../services/artifacts/artifactCover";

const cover = (format: Parameters<typeof artifactCover>[0], text: string) => artifactCover(format, Buffer.from(text));

describe("artifactCover", () => {
  it("reads a deck's slide titles from elements classed slide", () => {
    const html = `<html><head><style>.slide h2{color:red}</style></head><body>
      <div class="slide active"><h1>Q4 board update</h1><p>Revenue &amp; runway</p></div>
      <div class="slide"><h2>Revenue</h2></div>
      <div class="slide"><p>No heading here</p></div>
      <div class="slide-notes"><h2>Speaker notes</h2></div>
    </body></html>`;

    expect(cover("html", html)).toEqual({ kind: "deck", slides: ["Q4 board update", "Revenue", ""], slideCount: 3 });
  });

  it("reads a reveal.js deck's sections, but not a page's layout sections", () => {
    const reveal = `<div class="reveal"><div class="slides"><section><h1>One</h1></section><section><h2>Two</h2></section></div></div>`;
    const page = `<main><section><h1>Pricing</h1><p>Plans for every team.</p></section><section><p>FAQ</p></section></main>`;

    expect(cover("html", reveal)).toEqual({ kind: "deck", slides: ["One", "Two"], slideCount: 2 });
    expect(cover("html", page)).toEqual({ kind: "page", heading: "Pricing", excerpt: "Plans for every team. FAQ" });
  });

  it("knows a deck whose script draws the slides, from its container or its counter", () => {
    const counted = `<title>Q4 Roadmap</title><header><span class="counter">1 / 6</span></header><div id="slides"></div>`;
    const contained = `<title>Pitch</title><main class="deck"></main>`;

    expect(cover("html", counted)).toEqual({ kind: "deck", slides: ["Q4 Roadmap"], slideCount: 6 });
    expect(cover("html", contained)).toEqual({ kind: "deck", slides: ["Pitch"], slideCount: 0 });
  });

  it("falls back to the title for a page without an h1 and ignores scripts", () => {
    const html = `<title>Hiring plan</title><script>document.write("<p>nope</p>")</script><p>Two &#8212; three roles.</p>`;

    expect(cover("html", html)).toEqual({ kind: "page", heading: "Hiring plan", excerpt: "Two — three roles." });
  });

  it("reads a Markdown document's heading and opening prose", () => {
    const markdown = `---\ntitle: x\n---\n# Onboarding guide\n\nWelcome to **Acme**. See [the handbook](https://x).\n\n- Get your laptop\n\n\`\`\`sh\nnpm i\n\`\`\`\n`;

    expect(cover("markdown", markdown)).toEqual({
      kind: "page",
      heading: "Onboarding guide",
      excerpt: "Welcome to Acme. See the handbook. Get your laptop npm i",
    });
  });

  it("clips long excerpts", () => {
    const result = cover("text", "word ".repeat(200));

    expect(result).toMatchObject({ kind: "page", heading: null });
    expect(result?.kind === "page" && result.excerpt.length).toBe(280);
    expect(result?.kind === "page" && result.excerpt.endsWith("…")).toBe(true);
  });

  it("reads a CSV's header and first rows, with quoted fields and semicolons", () => {
    const csv = `vendor;category;amount_eur\nHetzner;Infra;"4,210.00"\n"Google ""WS""";Ops;2145.60\n`;

    expect(cover("csv", csv)).toEqual({
      kind: "table",
      columns: ["vendor", "category", "amount_eur"],
      rows: [
        ["Hetzner", "Infra", "4,210.00"],
        ['Google "WS"', "Ops", "2145.60"],
      ],
    });
  });

  it("keeps at most five rows and six columns", () => {
    const csv = ["a,b,c,d,e,f,g", ...Array.from({ length: 9 }, (_, i) => `${i},1,2,3,4,5,6`)].join("\n");
    const result = cover("csv", csv);

    expect(result?.kind === "table" && [result.columns.length, result.rows.length]).toEqual([6, 5]);
  });

  it("reads a JSON object's keys, or those of an array's first item", () => {
    expect(cover("json", `{"plan":"Team","customers":1086}`)).toEqual({ kind: "keys", keys: ["plan", "customers"] });
    expect(cover("json", `[{"id":1,"name":"a"}]`)).toEqual({ kind: "keys", keys: ["id", "name"] });
    expect(cover("json", `[1,2]`)).toBeNull();
    expect(cover("json", `{not json`)).toBeNull();
  });

  it("has nothing to draw for images and other files", () => {
    expect(cover("image", "\x89PNG")).toBeNull();
    expect(cover("pdf", "%PDF-1.7")).toBeNull();
  });
});
