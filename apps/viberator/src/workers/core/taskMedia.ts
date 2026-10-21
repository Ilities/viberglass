import * as fs from "fs";
import * as path from "path";
import type { Logger } from "winston";
import type { TicketMediaPayload } from "./types";

const DOWNLOAD_TIMEOUT_MS = 60_000;

/** A file attached to the task, where the agent can open it. */
export interface LocalTaskMedia {
  kind: TicketMediaPayload["kind"];
  filename: string;
  mimeType: string;
  path: string;
}

/** The workspace's sibling, so media are never committed or saved with a Files space. */
export function taskMediaDir(repoDir: string): string {
  return path.join(path.dirname(repoDir), "task-media");
}

/**
 * Puts the task's media where the agent can read them: Docker mounts them
 * into the container, and hosted workers download them from their signed
 * links, which expire before a long run ends. Media that can't be fetched
 * are left out with a warning; the turn goes on without them.
 */
export async function localTaskMedia(
  media: TicketMediaPayload[],
  dir: string,
  logger: Pick<Logger, "warn">,
  fetchFn: typeof fetch = fetch,
): Promise<LocalTaskMedia[]> {
  const local: LocalTaskMedia[] = [];
  for (const item of media) {
    const describe = { kind: item.kind, filename: item.filename, mimeType: item.mimeType };
    if (item.mountPath) {
      local.push({ ...describe, path: item.mountPath });
      continue;
    }
    if (!item.accessUrl) {
      logger.warn("Left out task media with no way to fetch it", { mediaId: item.id });
      continue;
    }
    try {
      const response = await fetchFn(item.accessUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${item.id}-${path.basename(item.filename).replace(/[^\w.-]/g, "_")}`);
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      local.push({ ...describe, path: file });
    } catch (error) {
      logger.warn("Couldn't download task media", { mediaId: item.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return local;
}

/** The prompt, followed by the task's media for the agent to open. */
export function withTaskMedia(prompt: string | undefined, media: LocalTaskMedia[]): string | undefined {
  if (!prompt || media.length === 0) return prompt;
  const lines = media.map((item) => `- ${item.kind}, ${item.filename} (${item.mimeType}): ${item.path}`);
  return `${prompt}\n\nAttached to the task, for you to open and look at:\n${lines.join("\n")}`;
}
