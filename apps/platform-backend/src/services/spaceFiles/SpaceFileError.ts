import { SPACE_FILES_RESERVED_PATHS, SPACE_TEXT_FILE_EXTENSIONS } from "@viberglass/types";
import { normalizeArchivePath } from "./inspectSpaceArchive";

export class SpaceFileError extends Error {
  constructor(
    readonly code: "FILE_CHANGED" | "FILE_NOT_FOUND" | "INVALID_PATH" | "NOT_TEXT" | "CHANGE_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

/** Paths people may write: inside the space's files, and not ones Viberglass writes or never saves. */
export function editablePath(raw: unknown): string {
  const path = typeof raw === "string" ? normalizeArchivePath(raw.trim().replace(/^\.\//, ""), false) : null;
  if (!path) throw new SpaceFileError("INVALID_PATH", "Choose a path inside the space's files, like notes/brief.md.");
  const root = path.split("/")[0];
  if ((SPACE_FILES_RESERVED_PATHS as readonly string[]).includes(path) || root === ".viberglass" || root === ".git") {
    throw new SpaceFileError("INVALID_PATH", `${path} is kept for Viberglass and can't be saved with the space's files.`);
  }
  return path;
}

export function isTextPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return path.includes(".") && (SPACE_TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);
}

/** The check a text save makes: the file still has the hash it was opened with, or still doesn't exist. */
export function unchangedSince(path: string, baseSha256: string | null) {
  return (files: Array<{ path: string; sha256: string }>): void => {
    const current = files.find((file) => file.path === path);
    if ((current?.sha256 ?? null) !== baseSha256) {
      throw new SpaceFileError(
        "FILE_CHANGED",
        current ? "Someone changed this file since you opened it. Reload it to see their version." : "This file was removed since you opened it.",
      );
    }
  };
}

/** The check a removal makes: the file is there to remove. */
export function exists(path: string) {
  return (files: Array<{ path: string }>): void => {
    if (!files.some((file) => file.path === path)) throw new SpaceFileError("FILE_NOT_FOUND", "That file isn't in the space's files.");
  };
}
