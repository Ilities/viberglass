import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import type { Logger } from "winston";
import type { AppDataCopyPayload } from "./types";

const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

/** A copy of the live app's database for this turn, where the agent can open it. */
export interface LocalAppDataCopy {
  path: string;
  copiedAt: string;
}

/** The workspace's sibling, so the copy is never committed. */
export function appDataCopyDir(repoDir: string): string {
  return path.join(path.dirname(repoDir), "app-data");
}

/** Downloads the copy a maintainer gave this turn. Without it the turn goes on, and the agent isn't told of one. */
export async function localAppDataCopy(
  copy: AppDataCopyPayload | undefined,
  dir: string,
  logger: Pick<Logger, "warn">,
  fetchFn: typeof fetch = fetch,
): Promise<LocalAppDataCopy | null> {
  if (!copy) return null;
  const file = path.join(dir, "app.db");
  try {
    const response = await fetchFn(copy.accessUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    await pipeline(Readable.fromWeb(response.body as WebReadableStream), fs.createWriteStream(file, { mode: 0o600 }));
    return { path: file, copiedAt: copy.copiedAt };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.warn("Couldn't download the copy of the app's data", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export function removeAppDataCopy(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** The prompt, followed by where the copy of the app's data is. */
export function withAppDataCopy(prompt: string | undefined, copy: LocalAppDataCopy | null): string | undefined {
  if (!prompt || !copy) return prompt;
  return (
    `${prompt}\n\nA copy of the live app's SQLite database, as it was at ${copy.copiedAt}, is at ${copy.path}. ` +
    "It's yours for this turn only. Read it to answer, and set APP_DATABASE_PATH to it to run the app against it. " +
    "Don't commit it, and don't copy data from it into the code; a fix to the data is code that goes through a change."
  );
}
