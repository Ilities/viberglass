import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { gzipSync } from "zlib";
import { SPACE_FILES_LIMITS } from "@viberglass/types";
import { captureWorkspace, restoreWorkspace, SpaceArchiveError, validateArchive } from "./spaceArchive";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "space-archive-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(dir: string, relative: string, content: string): void {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function listFiles(dir: string, prefix = ""): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? [`${relative}/`, ...listFiles(path.join(dir, entry.name), relative)] : [relative];
  });
}

interface RawEntry {
  name: string;
  /** ustar type flag: "0" file, "2" symlink, "1" hard link, "5" directory. */
  type: "0" | "1" | "2" | "5";
  data?: string;
  linkname?: string;
}

/** A gzip-compressed tar built byte by byte, so it can hold what our own capture never writes. */
function rawArchive(file: string, entries: RawEntry[]): void {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "");
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.write("        ", 148);
    header.write(entry.type, 156);
    header.write(entry.linkname ?? "", 157, 100, "utf8");
    header.write("ustar\0", 257);
    header.write("00", 263);
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  fs.writeFileSync(file, gzipSync(Buffer.concat(blocks)));
}

describe("captureWorkspace and restoreWorkspace", () => {
  it("round-trips files and empty directories with relative paths and a digest", async () => {
    const work = path.join(root, "work");
    write(work, "notes/outline.md", "# Outline\n");
    write(work, "deck/index.html", "<h1>Deck</h1>");
    fs.mkdirSync(path.join(work, "empty"), { recursive: true });
    const archive = path.join(root, "files.tar.gz");

    const captured = await captureWorkspace(work, archive);

    expect(captured).toMatchObject({ fileCount: 2, totalBytes: 23, skipped: [] });
    expect(captured.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(captured.archiveBytes).toBe(fs.statSync(archive).size);

    const restored = path.join(root, "restored");
    await expect(restoreWorkspace(archive, restored)).resolves.toEqual({ fileCount: 2, totalBytes: 23 });
    expect(listFiles(restored).sort()).toEqual(["deck/", "deck/index.html", "empty/", "notes/", "notes/outline.md"]);
    expect(fs.readFileSync(path.join(restored, "notes/outline.md"), "utf8")).toBe("# Outline\n");
  });

  it("leaves out the platform's files, caches, .git, .viberglass and links", async () => {
    const work = path.join(root, "work");
    write(work, "keep.md", "kept");
    write(work, "PLAN.md", "plan");
    write(work, "SUMMARY.md", "summary");
    write(work, "PR_TITLE.md", "title");
    write(work, ".git/HEAD", "ref: refs/heads/main");
    write(work, ".viberglass/artifacts.json", "{}");
    write(work, "app/node_modules/x/index.js", "cache");
    write(work, "nested/PLAN.md", "a person's own plan, kept");
    fs.symlinkSync("keep.md", path.join(work, "link.md"));
    fs.linkSync(path.join(work, "keep.md"), path.join(work, "hard.md"));
    const archive = path.join(root, "files.tar.gz");

    const captured = await captureWorkspace(work, archive);

    expect(captured.skipped).toEqual(["link.md"]);
    const restored = path.join(root, "restored");
    await restoreWorkspace(archive, restored);
    expect(listFiles(restored).sort()).toEqual(["app/", "hard.md", "keep.md", "nested/", "nested/PLAN.md"]);
    // A hard link is kept as a copy of its file.
    expect(fs.readFileSync(path.join(restored, "hard.md"), "utf8")).toBe("kept");
  });

  it("saves an empty space as an archive that restores to nothing", async () => {
    const work = path.join(root, "work");
    fs.mkdirSync(work);
    const archive = path.join(root, "files.tar.gz");

    await expect(captureWorkspace(work, archive)).resolves.toMatchObject({ fileCount: 0, totalBytes: 0 });
    const restored = path.join(root, "restored");
    await restoreWorkspace(archive, restored);
    expect(fs.readdirSync(restored)).toEqual([]);
  });

  it("refuses to save more files than the space may hold", async () => {
    const work = path.join(root, "work");
    fs.mkdirSync(work);
    for (let index = 0; index <= SPACE_FILES_LIMITS.maxFiles; index++) fs.writeFileSync(path.join(work, `f${index}`), "");

    await expect(captureWorkspace(work, path.join(root, "files.tar.gz"))).rejects.toThrow(SpaceArchiveError);
  });

  it("refuses to restore into a directory that already holds files", async () => {
    const work = path.join(root, "work");
    write(work, "a.md", "a");
    const archive = path.join(root, "files.tar.gz");
    await captureWorkspace(work, archive);

    await expect(restoreWorkspace(archive, work)).rejects.toThrow("wasn't empty");
  });
});

describe("validateArchive", () => {
  const cases: Array<[string, RawEntry[], string]> = [
    ["a path climbing out", [{ name: "../escape.md", type: "0", data: "x" }], "unsafe path"],
    ["a nested climbing path", [{ name: "notes/../../escape.md", type: "0", data: "x" }], "unsafe path"],
    ["an absolute path", [{ name: "/etc/passwd", type: "0", data: "x" }], "absolute path"],
    ["a symbolic link", [{ name: "link", type: "2", linkname: "/etc/passwd" }], "SymbolicLink"],
    ["a hard link", [{ name: "a", type: "0", data: "x" }, { name: "b", type: "1", linkname: "a" }], "Link"],
    ["the same path twice", [{ name: "a.md", type: "0", data: "x" }, { name: "a.md", type: "0", data: "y" }], "twice"],
    ["a backslash path", [{ name: "a\\b.md", type: "0", data: "x" }], "unsafe path"],
    ["a leading ./", [{ name: "./a.md", type: "0", data: "x" }], "unsafe path"],
  ];

  it.each(cases)("refuses %s", async (_label, entries, message) => {
    const archive = path.join(root, "bad.tar.gz");
    rawArchive(archive, entries);

    await expect(validateArchive(archive)).rejects.toThrow(message);
  });

  it("restores nothing from a refused archive", async () => {
    const archive = path.join(root, "bad.tar.gz");
    rawArchive(archive, [
      { name: "fine.md", type: "0", data: "fine" },
      { name: "../escape.md", type: "0", data: "x" },
    ]);
    const restored = path.join(root, "restored");

    await expect(restoreWorkspace(archive, restored)).rejects.toThrow(SpaceArchiveError);
    expect(fs.existsSync(path.join(restored, "fine.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "escape.md"))).toBe(false);
  });

  it("refuses files whose declared sizes exceed the space's limit", async () => {
    const archive = path.join(root, "big.tar.gz");
    // Zeros compress to almost nothing, so the archive itself stays tiny.
    const chunk = "\0".repeat(SPACE_FILES_LIMITS.maxTotalBytes / 2 + 1);
    rawArchive(archive, [
      { name: "a.bin", type: "0", data: chunk },
      { name: "b.bin", type: "0", data: chunk },
    ]);

    await expect(validateArchive(archive)).rejects.toThrow("MiB");
  });

  it("refuses data that isn't an archive", async () => {
    const archive = path.join(root, "junk.tar.gz");
    fs.writeFileSync(archive, "not gzip at all");

    await expect(validateArchive(archive)).rejects.toThrow("not a readable archive");
  });
});
