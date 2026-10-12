import { createReadStream, promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { Readable } from "stream";
import { createGunzip, gzipSync } from "zlib";
import { create, extract, Parser, type ReadEntry } from "tar";

/**
 * Calls `onFile` with the whole content of each wanted regular file, in archive
 * order. Only for archives already checked by inspectSpaceArchive.
 */
export async function readArchiveFiles(
  archive: Readable,
  wanted: (path: string) => boolean,
  onFile: (path: string, content: Buffer) => Promise<void>,
): Promise<void> {
  const pending: Array<Promise<void>> = [];
  const parser = new Parser({
    strict: true,
    onReadEntry: (entry: ReadEntry) => {
      const name = entry.path.replace(/\/$/, "");
      if (entry.type === "Directory" || !wanted(name)) {
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => pending.push(onFile(name, Buffer.concat(chunks))));
    },
  });
  await new Promise<void>((resolve, reject) => {
    const unzip = createGunzip();
    unzip.on("error", reject);
    archive.on("error", reject);
    parser.on("error", (error: Error & { code?: string }) => (error.code === "TAR_BAD_ARCHIVE" ? resolve() : reject(error)));
    parser.on("end", resolve);
    parser.on("close", resolve);
    archive.pipe(unzip).pipe(parser);
  });
  await Promise.all(pending);
}

/** One file's content, or null when the archive doesn't have it. */
export async function readArchiveFile(archive: Readable, wantedPath: string): Promise<Buffer | null> {
  let found: Buffer | null = null;
  await readArchiveFiles(archive, (name) => name === wantedPath, async (_name, content) => {
    found = content;
  });
  return found;
}

/** A change people make to a space's files: write content at a path, or remove a path. */
export type SpaceFileChange = { kind: "write"; path: string; content: Buffer } | { kind: "remove"; path: string };

/**
 * Unpacks a checked archive into a temporary folder, applies the change, and
 * packs the result as a new gzip-compressed tar. Returns the new archive's path
 * and a cleanup function.
 */
export async function repackArchive(
  archive: Readable | null,
  change: SpaceFileChange,
): Promise<{ archivePath: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "space-files-"));
  const work = path.join(root, "files");
  await fs.mkdir(work);
  const cleanup = () => fs.rm(root, { recursive: true, force: true });
  try {
    if (archive) {
      await new Promise<void>((resolve, reject) => {
        const unzip = createGunzip();
        const unpack = extract({ cwd: work, strict: true, preservePaths: false });
        unzip.on("error", reject);
        archive.on("error", reject);
        unpack.on("error", (error: Error & { code?: string }) => (error.code === "TAR_BAD_ARCHIVE" ? resolve() : reject(error)));
        unpack.on("close", resolve);
        archive.pipe(unzip).pipe(unpack);
      });
    }
    const target = path.join(work, change.path);
    if (!target.startsWith(work + path.sep)) throw new Error("The path must be inside the space's files");
    if (change.kind === "write") {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, change.content);
    } else {
      await fs.rm(target, { force: true });
      await removeEmptyParents(path.dirname(target), work);
    }
    const entries = await fs.readdir(work);
    const archivePath = path.join(root, "workspace.tar.gz");
    if (entries.length === 0) {
      // An empty space saves only the end-of-archive blocks, like the worker does.
      await fs.writeFile(archivePath, gzipSync(Buffer.alloc(1024)));
    } else {
      await create({ gzip: true, cwd: work, file: archivePath, portable: true, noMtime: true }, entries.sort());
    }
    return { archivePath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function removeEmptyParents(dir: string, root: string): Promise<void> {
  let current = dir;
  while (current.startsWith(root + path.sep)) {
    if ((await fs.readdir(current)).length > 0) return;
    await fs.rmdir(current);
    current = path.dirname(current);
  }
}

export function openFile(filePath: string): Readable {
  return createReadStream(filePath);
}
