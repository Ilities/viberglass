import { createHash } from "crypto";
import { createGunzip } from "zlib";
import type { Readable } from "stream";
import { Parser, type ReadEntry } from "tar";
import { SPACE_FILES_LIMITS, type SpaceFilesManifestEntry } from "@viberglass/types";

export class InvalidSpaceArchive extends Error {}

export interface InspectedSpaceArchive {
  sha256: string;
  archiveBytes: number;
  totalBytes: number;
  manifest: SpaceFilesManifestEntry[];
}

/**
 * The entry's path when it is a plain relative path inside the working
 * directory, or null. Same rules as the worker's: no leading `/` or `./`, no
 * empty, `.` or `..` segments, and a trailing `/` only on folders.
 */
export function normalizeArchivePath(raw: string, directory: boolean): string | null {
  if (!raw || raw.includes("\0") || raw.includes("\\")) return null;
  const path = directory && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (path.length === 0 || path.length > SPACE_FILES_LIMITS.maxPathLength) return null;
  const segments = path.split("/");
  return segments.some((segment) => segment === "" || segment === "." || segment === "..") ? null : path;
}

/**
 * Reads an uploaded archive of a space's files without unpacking it: only
 * regular files and directories with safe relative paths, within the limits.
 * The archive comes from a worker, so nothing about it is trusted.
 */
export async function inspectSpaceArchive(archive: Readable): Promise<InspectedSpaceArchive> {
  const archiveHash = createHash("sha256");
  let archiveBytes = 0;
  let totalBytes = 0;
  const seen = new Set<string>();
  const manifest: SpaceFilesManifestEntry[] = [];
  let failure: InvalidSpaceArchive | null = null;
  const fail = (message: string) => {
    failure ??= new InvalidSpaceArchive(message);
  };

  const parser = new Parser({
    strict: true,
    onReadEntry: (entry: ReadEntry) => {
      const path = normalizeArchivePath(entry.path, entry.type === "Directory");
      if (failure || !path) {
        if (!path) fail(`The archive has an unsafe path: ${JSON.stringify(entry.path).slice(0, 200)}`);
        entry.resume();
        return;
      }
      if (seen.has(path)) {
        fail(`The archive lists ${path} more than once.`);
        entry.resume();
        return;
      }
      seen.add(path);
      if (entry.type === "Directory") {
        entry.resume();
        return;
      }
      if (entry.type !== "File" && entry.type !== "OldFile" && entry.type !== "ContiguousFile") {
        fail(`The archive has ${path}, which is a ${entry.type}; only files and folders can be saved.`);
        entry.resume();
        return;
      }
      if (manifest.length + 1 > SPACE_FILES_LIMITS.maxFiles) {
        fail(`The files are more than ${SPACE_FILES_LIMITS.maxFiles} files.`);
        entry.resume();
        return;
      }
      totalBytes += entry.size ?? 0;
      if (totalBytes > SPACE_FILES_LIMITS.maxTotalBytes) {
        fail(`The files are larger than ${SPACE_FILES_LIMITS.maxTotalBytes / 1024 / 1024} MiB.`);
        entry.resume();
        return;
      }
      const hash = createHash("sha256");
      let bytes = 0;
      entry.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      entry.on("end", () => manifest.push({ path, bytes, sha256: hash.digest("hex") }));
    },
  });

  // An empty space saves only the end-of-archive zero blocks, which the parser
  // doesn't recognise as a tar; zeros alone are an archive with no files.
  let sawContent = false;
  const unzip = createGunzip();
  unzip.on("data", (chunk: Buffer) => {
    if (!sawContent && chunk.some((byte) => byte !== 0)) sawContent = true;
  });
  const parserFailure = (message: string, code?: string) => {
    if (code === "TAR_BAD_ARCHIVE" && !sawContent) return;
    fail(`The archive is malformed: ${message}`);
  };

  await new Promise<void>((resolve, reject) => {
    parser.on("warn", (code: string, message: string) => parserFailure(message, code));
    parser.on("error", (error: Error & { code?: string }) => parserFailure(error.message, error.code));
    parser.on("end", resolve);
    parser.on("close", resolve);
    unzip.on("error", (error: Error) => {
      fail(`The archive isn't gzip-compressed: ${error.message}`);
      resolve();
    });
    archive.on("error", reject);
    archive.on("data", (chunk: Buffer) => {
      archiveBytes += chunk.length;
      archiveHash.update(chunk);
      // Stop reading past what a compressed archive of valid files could need.
      if (archiveBytes > SPACE_FILES_LIMITS.maxTotalBytes * 2) {
        fail("The archive is too large.");
        archive.destroy();
        resolve();
      }
    });
    archive.pipe(unzip).pipe(parser);
  });

  if (failure) throw failure;
  manifest.sort((a, b) => a.path.localeCompare(b.path));
  return { sha256: archiveHash.digest("hex"), archiveBytes, totalBytes, manifest };
}

/** How a snapshot's files differ from its parent's. */
export function compareManifests(
  before: SpaceFilesManifestEntry[],
  after: SpaceFilesManifestEntry[],
): { added: number; changed: number; removed: number } {
  const previous = new Map(before.map((entry) => [entry.path, entry.sha256]));
  let added = 0;
  let changed = 0;
  for (const entry of after) {
    const hash = previous.get(entry.path);
    if (hash === undefined) added++;
    else if (hash !== entry.sha256) changed++;
    previous.delete(entry.path);
  }
  return { added, changed, removed: previous.size };
}
