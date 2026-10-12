import { createHash } from "crypto";
import { Readable } from "stream";
import { gzipSync } from "zlib";
import { Header } from "tar";
import {
  compareManifests,
  inspectSpaceArchive,
  InvalidSpaceArchive,
  normalizeArchivePath,
} from "../../../../services/spaceFiles/inspectSpaceArchive";

type Entry = { path: string; type?: "File" | "Directory" | "SymbolicLink" | "Link"; body?: string; linkpath?: string };

/** A gzip-compressed tar built block by block, so it can hold entries no well-behaved tool would write. */
function archive(entries: Entry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? "");
    const type = entry.type ?? "File";
    const header = new Header({
      path: entry.path,
      mode: type === "Directory" ? 0o755 : 0o644,
      size: type === "File" ? body.length : 0,
      mtime: new Date(0),
      type,
      ...(entry.linkpath ? { linkpath: entry.linkpath } : {}),
    });
    const block = Buffer.alloc(512);
    header.encode(block, 0);
    blocks.push(block);
    if (type === "File" && body.length > 0) {
      blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

describe("inspectSpaceArchive", () => {
  it("lists a space's files with their sizes and hashes, and the archive's own hash", async () => {
    const bytes = archive([
      { path: "notes", type: "Directory" },
      { path: "notes/brief.md", body: "# Brief" },
      { path: "deck.html", body: "<h1>Q4</h1>" },
    ]);
    const inspected = await inspectSpaceArchive(Readable.from([bytes]));
    expect(inspected).toEqual({
      sha256: createHash("sha256").update(bytes).digest("hex"),
      archiveBytes: bytes.length,
      totalBytes: 18,
      manifest: [
        { path: "deck.html", bytes: 11, sha256: sha("<h1>Q4</h1>") },
        { path: "notes/brief.md", bytes: 7, sha256: sha("# Brief") },
      ],
    });
  });

  it("reads a space with no files from an archive of zero blocks", async () => {
    const inspected = await inspectSpaceArchive(Readable.from([gzipSync(Buffer.alloc(1024))]));
    expect(inspected).toMatchObject({ totalBytes: 0, manifest: [] });
  });

  it.each([
    ["a path out of the working directory", [{ path: "../escape.md", body: "x" }]],
    ["an absolute path", [{ path: "/etc/passwd", body: "x" }]],
    ["a ./ path", [{ path: "./notes.md", body: "x" }]],
    ["a symbolic link", [{ path: "link", type: "SymbolicLink", linkpath: "/etc/passwd" }]],
    ["a hard link", [{ path: "notes.md", body: "x" }, { path: "copy.md", type: "Link", linkpath: "notes.md" }]],
    ["the same path twice", [{ path: "notes.md", body: "a" }, { path: "notes.md", body: "b" }]],
    ["a file and a folder with one name", [{ path: "notes", body: "a" }, { path: "notes", type: "Directory" }]],
  ] as Array<[string, Entry[]]>)("refuses %s", async (_name, entries) => {
    await expect(inspectSpaceArchive(Readable.from([archive(entries)]))).rejects.toBeInstanceOf(InvalidSpaceArchive);
  });

  it("refuses an upload that isn't gzip-compressed", async () => {
    await expect(inspectSpaceArchive(Readable.from([Buffer.from("not an archive")]))).rejects.toBeInstanceOf(InvalidSpaceArchive);
  });
});

describe("normalizeArchivePath", () => {
  it("allows a trailing slash only on folders", () => {
    expect(normalizeArchivePath("notes/", true)).toBe("notes");
    expect(normalizeArchivePath("notes/", false)).toBeNull();
    expect(normalizeArchivePath("a//b", false)).toBeNull();
    expect(normalizeArchivePath("a\\b", false)).toBeNull();
    expect(normalizeArchivePath("deck/slides.html", false)).toBe("deck/slides.html");
  });
});

describe("compareManifests", () => {
  it("counts added, changed and removed files", () => {
    const before = [
      { path: "a.md", bytes: 1, sha256: "1" },
      { path: "b.md", bytes: 1, sha256: "2" },
      { path: "c.md", bytes: 1, sha256: "3" },
    ];
    const after = [
      { path: "a.md", bytes: 1, sha256: "1" },
      { path: "b.md", bytes: 2, sha256: "changed" },
      { path: "d.md", bytes: 1, sha256: "4" },
    ];
    expect(compareManifests(before, after)).toEqual({ added: 1, changed: 1, removed: 1 });
  });
});
