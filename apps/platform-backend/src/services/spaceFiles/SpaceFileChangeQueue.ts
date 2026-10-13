import { randomUUID } from "crypto";
import type { SpaceFileChangeSummary } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import {
  SpaceFileChangesDAO,
  summaryOfChange,
  type SpaceFileChangeRecord,
} from "../../persistence/spaceFiles/SpaceFileChangesDAO";
import { SpaceFileChangeApplier } from "./SpaceFileChangeApplier";
import { exists, SpaceFileError, unchangedSince } from "./SpaceFileError";
import type { SpaceFileChange } from "./spaceArchiveFiles";
import { S3SpaceFilesStore, type SpaceFilesStore } from "./SpaceFilesStore";

const logger = createChildLogger({ service: "SpaceFileChangeQueue" });

/** Where a waiting change's content is kept until it's saved or dismissed. */
export function stagedChangeUrl(bucket: string, projectId: string, changeId: string): string {
  return `s3://${bucket}/spaces/${projectId}/changes/${changeId}`;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Starts the space's next waiting run once its waiting changes are saved. */
export interface SpaceWaiters {
  startWaiting(projectId: string): void;
}

/**
 * People's changes made while a run held the space. Each waits with its
 * content staged in storage and is saved, oldest first, as soon as the space
 * is free; a text save the run made stale fails then, keeping the text.
 */
export class SpaceFileChangeQueue {
  constructor(
    private readonly waiters: SpaceWaiters,
    private readonly changes: SpaceFileChangesDAO = new SpaceFileChangesDAO(),
    private readonly store: SpaceFilesStore = new S3SpaceFilesStore(),
    private readonly applier: Pick<SpaceFileChangeApplier, "tryApply"> = new SpaceFileChangeApplier(undefined, store),
  ) {}

  async add(projectId: string, userId: string, change: SpaceFileChange, base?: { sha256: string | null }): Promise<SpaceFileChangeSummary> {
    const id = randomUUID();
    let stagedUrl: string | null = null;
    if (change.kind === "write") {
      stagedUrl = stagedChangeUrl(this.store.bucket(), projectId, id);
      await this.store.put(stagedUrl, change.content, change.content.length, "application/octet-stream");
    }
    const record = await this.changes.insert({
      id,
      projectId,
      createdBy: userId,
      kind: change.kind,
      path: change.path,
      checkBase: base !== undefined,
      baseSha256: base?.sha256 ?? null,
      stagedUrl,
      bytes: change.kind === "write" ? change.content.length : null,
    });
    // The space may have come free since the change found it busy.
    this.waiters.startWaiting(projectId);
    return summaryOfChange(record);
  }

  async list(projectId: string): Promise<SpaceFileChangeSummary[]> {
    return (await this.changes.listOpen(projectId)).map(summaryOfChange);
  }

  /** What a waiting or failed change would have written, so a refused text save isn't lost. */
  async content(projectId: string, changeId: string): Promise<{ path: string; content: Buffer }> {
    const change = await this.changes.get(projectId, changeId);
    if (!change?.stagedUrl) throw new SpaceFileError("CHANGE_NOT_FOUND", "That change isn't waiting any more.");
    return { path: change.path, content: await readAll(await this.store.open(change.stagedUrl)) };
  }

  /** Drops a change: a waiting one is never saved, a failed one stops being shown. */
  async dismiss(projectId: string, changeId: string): Promise<void> {
    const change = await this.changes.get(projectId, changeId);
    if (!change) throw new SpaceFileError("CHANGE_NOT_FOUND", "That change isn't waiting any more.");
    await this.changes.delete(change.id);
    if (change.stagedUrl) await this.deleteStaged(change.stagedUrl);
  }

  /** Saves the space's waiting changes while it is free; stops at the first one that finds it busy. */
  async applyWaiting(projectId: string): Promise<void> {
    for (const change of await this.changes.listWaiting(projectId)) {
      if (!(await this.applyOne(change))) return;
    }
  }

  async spacesWithWaiting(): Promise<string[]> {
    return this.changes.listSpacesWithWaiting();
  }

  /** False when the space is busy or saving failed in a way worth trying again later. */
  private async applyOne(change: SpaceFileChangeRecord): Promise<boolean> {
    try {
      const fileChange: SpaceFileChange =
        change.kind === "write" && change.stagedUrl
          ? { kind: "write", path: change.path, content: await readAll(await this.store.open(change.stagedUrl)) }
          : { kind: "remove", path: change.path };
      const check = change.checkBase ? unchangedSince(change.path, change.baseSha256) : change.kind === "remove" ? exists(change.path) : undefined;
      const saved = await this.applier.tryApply(change.projectId, change.createdBy, fileChange, check);
      if (!saved) return false;
      await this.changes.markSaved(change.id, saved.id);
      if (change.stagedUrl) await this.deleteStaged(change.stagedUrl);
      return true;
    } catch (error) {
      if (error instanceof SpaceFileError && error.code === "FILE_NOT_FOUND" && change.kind === "remove") {
        // Someone else removed it first: what the person wanted is done.
        await this.changes.markSaved(change.id, null);
        return true;
      }
      if (error instanceof SpaceFileError) {
        await this.changes.markFailed(change.id, error.message);
        return true;
      }
      logger.warn("Could not save a waiting change; trying again later", {
        changeId: change.id,
        projectId: change.projectId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async deleteStaged(stagedUrl: string): Promise<void> {
    try {
      await this.store.delete(stagedUrl);
    } catch (error) {
      logger.warn("Could not delete a change's staged content", { stagedUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
