import { artifactFormatOf, contentTypeOf, resolveArtifactDeclarations } from "../../../../services/artifacts/artifactDeclarations";

const SAVED = [
  { path: "deck/index.html", bytes: 100, sha256: "a" },
  { path: "deck/assets/app.js", bytes: 50, sha256: "b" },
  { path: "deck/assets/style.css", bytes: 20, sha256: "c" },
  { path: "brief.md", bytes: 10, sha256: "d" },
  { path: "notes/scratch.md", bytes: 5, sha256: "e" },
];

describe("resolveArtifactDeclarations", () => {
  it("takes the entrypoint, named files and everything in named folders", () => {
    const [deck] = resolveArtifactDeclarations(
      { artifacts: [{ title: " Q4 deck ", entrypoint: "./deck/index.html", files: ["deck/assets/"] }] },
      SAVED,
    );
    expect(deck).toMatchObject({ title: "Q4 deck", artifactId: null, entrypoint: "deck/index.html", format: "html", totalBytes: 170 });
    expect(deck.files.map((file) => [file.path, file.contentType])).toEqual([
      ["deck/assets/app.js", "text/javascript; charset=utf-8"],
      ["deck/assets/style.css", "text/css; charset=utf-8"],
      ["deck/index.html", "text/html; charset=utf-8"],
    ]);
  });

  it("keeps a single Markdown file by its entrypoint alone, and an id it revises", () => {
    const id = "6f1c2c5e-4f6a-4b8e-9a43-0d2b3c4d5e6f";
    const [brief] = resolveArtifactDeclarations({ artifacts: [{ title: "Brief", entrypoint: "brief.md", artifactId: id.toUpperCase() }] }, SAVED);
    expect(brief).toMatchObject({ artifactId: id, format: "markdown", files: [expect.objectContaining({ path: "brief.md" })] });
  });

  it.each([
    ["no declaration", null, "didn't declare"],
    ["the wrong shape", { title: "x" }, "must be"],
    ["no artifacts", { artifacts: [] }, "declared no artifacts"],
    ["no title", { artifacts: [{ entrypoint: "brief.md" }] }, "needs a title"],
    ["a missing entrypoint", { artifacts: [{ title: "Gone", entrypoint: "gone.md" }] }, "isn't in the saved files"],
    ["a path out of the files", { artifacts: [{ title: "Out", entrypoint: "../etc/passwd" }] }, "inside the working directory"],
    ["a missing file", { artifacts: [{ title: "Deck", entrypoint: "deck/index.html", files: ["deck/missing.js"] }] }, "isn't in the saved files"],
    ["an empty folder", { artifacts: [{ title: "Deck", entrypoint: "deck/index.html", files: ["slides/"] }] }, "has no saved files"],
    ["a malformed id", { artifacts: [{ title: "Deck", entrypoint: "deck/index.html", artifactId: "deck" }] }, "isn't an artifact's id"],
  ])("explains %s", (_name, raw, message) => {
    expect(() => resolveArtifactDeclarations(raw, SAVED)).toThrow(message);
  });
});

describe("formats and content types", () => {
  it("previews by the entrypoint's kind and serves unknown files as bytes", () => {
    expect(artifactFormatOf("deck/index.HTML")).toBe("html");
    expect(artifactFormatOf("report.pdf")).toBe("pdf");
    expect(artifactFormatOf("model.bin")).toBe("other");
    expect(contentTypeOf("data.bin")).toBe("application/octet-stream");
    expect(contentTypeOf("logo.svg")).toBe("image/svg+xml");
  });
});
