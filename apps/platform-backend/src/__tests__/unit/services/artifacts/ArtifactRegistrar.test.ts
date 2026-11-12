import { Readable } from "stream";
import type { NewArtifactVersion } from "../../../../persistence/artifacts/ArtifactDAO";
import { ArtifactRegistrar } from "../../../../services/artifacts/ArtifactRegistrar";
import type { SpaceFilesStore } from "../../../../services/spaceFiles/SpaceFilesStore";
import { readArchiveFiles } from "../../../../services/spaceFiles/spaceArchiveFiles";

jest.mock("../../../../services/spaceFiles/spaceArchiveFiles", () => ({ readArchiveFiles: jest.fn() }));

const FILES: Record<string, string> = {
  "deck/index.html": `<div class="slide"><h1>Q4 board update</h1></div><div class="slide"><h2>Revenue</h2></div>`,
  "deck/style.css": "h1{}",
  "notes.md": "# Notes\n\nKeep it short.",
};

function version(entrypoint: string, format: NewArtifactVersion["format"], paths: string[]): NewArtifactVersion {
  return {
    versionId: `ver-${entrypoint}`,
    artifactId: `art-${entrypoint}`,
    create: true,
    projectId: "space-1",
    ticketId: null,
    title: entrypoint,
    snapshotId: "snap-1",
    jobId: null,
    createdBy: null,
    format,
    entrypoint,
    files: paths.map((path) => ({ path, bytes: FILES[path].length, sha256: "x", contentType: "text/plain" })),
    storagePrefix: `s3://bucket/spaces/space-1/artifacts/${entrypoint}`,
    totalBytes: 0,
    cover: null,
  };
}

describe("ArtifactRegistrar.storeFiles", () => {
  it("stores each version's files and reads its cover from the entry file", async () => {
    jest.mocked(readArchiveFiles).mockImplementation(async (_archive, wanted, onFile) => {
      for (const [path, content] of Object.entries(FILES)) if (wanted(path)) await onFile(path, Buffer.from(content));
    });
    const store: SpaceFilesStore = {
      bucket: () => "bucket",
      sign: jest.fn(),
      open: jest.fn(),
      put: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn(),
    };
    const registrar = new ArtifactRegistrar(store, { revisableIds: jest.fn(), listCurrentWithPath: jest.fn() });
    const deck = version("deck/index.html", "html", ["deck/index.html", "deck/style.css"]);
    const notes = version("notes.md", "markdown", ["notes.md"]);

    await registrar.storeFiles(async () => Readable.from([]), [deck, notes]);

    expect(store.put).toHaveBeenCalledTimes(3);
    expect(deck.cover).toEqual({ kind: "deck", slides: ["Q4 board update", "Revenue"], slideCount: 2 });
    expect(notes.cover).toEqual({ kind: "page", heading: "Notes", excerpt: "Keep it short." });
  });
});
