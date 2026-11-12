import { Readable } from "stream";
import type { VersionMissingCover } from "../../../../persistence/artifacts/ArtifactCoverDAO";
import { ArtifactCoverBackfill } from "../../../../services/artifacts/ArtifactCoverBackfill";

function version(id: string, format: VersionMissingCover["format"], entrypoint: string): VersionMissingCover {
  return { id, format, entrypoint, storagePrefix: `s3://bucket/spaces/s/artifacts/a/versions/${id}/files/` };
}

describe("ArtifactCoverBackfill", () => {
  it("reads each version's entry file, keeps going past one it can't read, and pages through every batch", async () => {
    const first = Array.from({ length: 50 }, (_, index) => version(`v${String(index).padStart(2, "0")}`, "markdown", "notes.md"));
    const versions = {
      listMissing: jest.fn().mockResolvedValueOnce([version("missing", "html", "gone.html"), ...first.slice(1)]).mockResolvedValueOnce([version("v99", "json", "data.json")]),
      setCover: jest.fn().mockResolvedValue(undefined),
    };
    const store = {
      open: jest.fn(async (url: string) => {
        if (url.endsWith("gone.html")) throw new Error("NoSuchKey");
        return Readable.from([Buffer.from(url.endsWith(".json") ? "[1, 2]" : "# Notes\n\nShort.")]);
      }),
    };

    const covered = await new ArtifactCoverBackfill(versions, store).run();

    expect(covered).toBe(49);
    expect(versions.listMissing).toHaveBeenNthCalledWith(2, "v49", 50);
    expect(store.open).toHaveBeenCalledWith("s3://bucket/spaces/s/artifacts/a/versions/v01/files/notes.md");
    expect(versions.setCover).toHaveBeenCalledWith("v01", { kind: "page", heading: "Notes", excerpt: "Short." });
    expect(versions.setCover).not.toHaveBeenCalledWith("v99", expect.anything());
  });
});
