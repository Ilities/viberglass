import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import { gunzipSync, gzipSync } from "zlib";
import {
  SPACE_FILES_LIMITS,
  SPACE_FILES_RESERVED_PATHS,
  SPACE_FILES_SKIPPED_DIRECTORIES,
} from "@viberglass/types";

/** Why a space's files couldn't be saved or restored, worded for the person reading the run. */
export class SpaceArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaceArchiveError";
  }
}

export interface CapturedArchive {
  sha256: string;
  archiveBytes: number;
  fileCount: number;
  totalBytes: number;
  /** Links and special files left out, relative to the working directory. */
  skipped: string[];
}

// `.viberglass/` is the platform's control folder, such as the artifact declaration.
const RESERVED_AT_ROOT: ReadonlySet<string> = new Set<string>([...SPACE_FILES_RESERVED_PATHS, ".git", ".viberglass"]);
const SKIPPED_ANYWHERE: ReadonlySet<string> = new Set<string>(SPACE_FILES_SKIPPED_DIRECTORIES);
const MiB = 1024 * 1024;

/** Hard links are stored as copies: a link entry would point at another path in the archive, which a restore refuses. */
class NeverLinked extends Map<`${number}:${number}`, string> {
  override get(): undefined {
    return undefined;
  }
  override set(): this {
    return this;
  }
}

/**
 * Archives the working directory's files and directories as a gzip-compressed
 * tar, with paths relative to it. Links and special files are left out, and so
 * are the platform's own files and caches a run can rebuild.
 */
export async function captureWorkspace(workDir: string, archiveFile: string): Promise<CapturedArchive> {
  const entries: string[] = [];
  const skipped: string[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  const walk = (relativeDir: string): void => {
    const absoluteDir = path.join(workDir, relativeDir);
    for (const name of fs.readdirSync(absoluteDir).sort()) {
      const relative = relativeDir ? `${relativeDir}/${name}` : name;
      if (!relativeDir && RESERVED_AT_ROOT.has(name)) continue;
      const stat = fs.lstatSync(path.join(absoluteDir, name));
      if (stat.isDirectory()) {
        if (SKIPPED_ANYWHERE.has(name)) continue;
        checkPath(relative);
        entries.push(relative);
        walk(relative);
      } else if (stat.isFile()) {
        checkPath(relative);
        fileCount += 1;
        totalBytes += stat.size;
        if (fileCount > SPACE_FILES_LIMITS.maxFiles) {
          throw new SpaceArchiveError(`The space has more than ${SPACE_FILES_LIMITS.maxFiles} files, so they can't be saved.`);
        }
        if (totalBytes > SPACE_FILES_LIMITS.maxTotalBytes) {
          throw new SpaceArchiveError(
            `The space's files are over ${SPACE_FILES_LIMITS.maxTotalBytes / MiB} MiB, so they can't be saved.`,
          );
        }
        entries.push(relative);
      } else {
        skipped.push(relative);
      }
    }
  };
  walk("");

  if (entries.length > 0) {
    await tar.c({ gzip: true, file: archiveFile, cwd: workDir, portable: true, noDirRecurse: true, linkCache: new NeverLinked() }, entries);
  } else {
    // An empty space is still saved, as an archive of nothing (tar refuses an empty list): end-of-archive blocks only.
    fs.writeFileSync(archiveFile, gzipSync(Buffer.alloc(1024)));
  }
  const { sha256, bytes } = await digestFile(archiveFile);
  return { sha256, archiveBytes: bytes, fileCount, totalBytes, skipped };
}

function checkPath(relative: string): void {
  if (relative.length > SPACE_FILES_LIMITS.maxPathLength) {
    throw new SpaceArchiveError(`A path in the space is longer than ${SPACE_FILES_LIMITS.maxPathLength} characters: ${relative.slice(0, 80)}…`);
  }
  if (relative.includes("\\") || relative.includes("\0")) {
    throw new SpaceArchiveError(`A file name in the space can't be saved: ${JSON.stringify(relative)}`);
  }
}

export async function digestFile(file: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    const buffer = chunk as Buffer;
    hash.update(buffer);
    bytes += buffer.length;
  }
  return { sha256: hash.digest("hex"), bytes };
}

/** The entry's path, normalized, or why it isn't safe to restore. */
export function normalizeEntryPath(raw: string, isDirectory: boolean): string {
  const trimmed = isDirectory ? raw.replace(/\/+$/, "") : raw;
  if (!trimmed) throw new SpaceArchiveError("The saved files contain an entry without a name.");
  if (trimmed.includes("\\") || trimmed.includes("\0")) throw new SpaceArchiveError(`The saved files contain an unsafe path: ${JSON.stringify(raw)}`);
  if (trimmed.startsWith("/")) throw new SpaceArchiveError(`The saved files contain an absolute path: ${raw}`);
  if (trimmed.length > SPACE_FILES_LIMITS.maxPathLength) throw new SpaceArchiveError("The saved files contain a path that is too long.");
  for (const segment of trimmed.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new SpaceArchiveError(`The saved files contain an unsafe path: ${raw}`);
    }
  }
  return trimmed;
}

/**
 * Reads every entry of an archive and refuses it unless it holds only files
 * and directories at safe, distinct relative paths, within the space's limits.
 */
export async function validateArchive(archiveFile: string): Promise<{ fileCount: number; totalBytes: number }> {
  if (isEmptyArchive(archiveFile)) return { fileCount: 0, totalBytes: 0 };
  const seen = new Set<string>();
  let fileCount = 0;
  let totalBytes = 0;
  let problem: SpaceArchiveError | null = null;

  const fail = (error: SpaceArchiveError) => {
    problem ??= error;
  };

  try {
    await tar.t({
      file: archiveFile,
      strict: true,
      onReadEntry: (entry) => {
        if (problem) return;
        try {
          const isDirectory = entry.type === "Directory";
          if (!isDirectory && entry.type !== "File" && entry.type !== "OldFile" && entry.type !== "ContiguousFile") {
            throw new SpaceArchiveError(`The saved files contain a ${entry.type} entry, which can't be restored: ${entry.path}`);
          }
          const normalized = normalizeEntryPath(entry.path, isDirectory);
          if (seen.has(normalized)) throw new SpaceArchiveError(`The saved files contain ${normalized} twice.`);
          seen.add(normalized);
          if (!isDirectory) {
            fileCount += 1;
            totalBytes += entry.size ?? 0;
            if (fileCount > SPACE_FILES_LIMITS.maxFiles) throw new SpaceArchiveError(`The saved files hold more than ${SPACE_FILES_LIMITS.maxFiles} files.`);
            if (totalBytes > SPACE_FILES_LIMITS.maxTotalBytes) {
              throw new SpaceArchiveError(`The saved files are over ${SPACE_FILES_LIMITS.maxTotalBytes / MiB} MiB.`);
            }
          }
        } catch (error) {
          fail(error instanceof SpaceArchiveError ? error : new SpaceArchiveError(String(error)));
        }
      },
    });
  } catch (error) {
    if (problem) throw problem;
    throw new SpaceArchiveError(`The saved files are not a readable archive: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (problem) throw problem;
  return { fileCount, totalBytes };
}

/**
 * An archive of nothing is only end-of-archive blocks, which tar refuses to
 * read as an archive at all; an empty space is saved as one.
 */
function isEmptyArchive(archiveFile: string): boolean {
  if (fs.statSync(archiveFile).size > 1024) return false;
  try {
    const content = gunzipSync(fs.readFileSync(archiveFile));
    return content.length >= 1024 && content.length % 512 === 0 && content.every((byte) => byte === 0);
  } catch {
    return false;
  }
}

/** Validates the archive, then extracts it into the empty working directory. */
export async function restoreWorkspace(archiveFile: string, workDir: string): Promise<{ fileCount: number; totalBytes: number }> {
  const counts = await validateArchive(archiveFile);
  fs.mkdirSync(workDir, { recursive: true });
  if (fs.readdirSync(workDir).length > 0) throw new SpaceArchiveError("The working directory wasn't empty before restoring the space's files.");
  if (isEmptyArchive(archiveFile)) return counts;
  await tar.x({
    file: archiveFile,
    cwd: workDir,
    strict: true,
    preservePaths: false,
    preserveOwner: false,
    noChmod: true,
    filter: (_entryPath, entry) => "type" in entry && (entry.type === "File" || entry.type === "OldFile" || entry.type === "ContiguousFile" || entry.type === "Directory"),
  });
  return counts;
}
