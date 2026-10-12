import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import type { Logger } from "winston";
import { withSpan } from "@viberglass/telemetry";
import { JOB_FAILURE_CODE, type FilesCheckpointResult, type FilesWorkspacePayload } from "@viberglass/types";
import { JobFailureError } from "../core/JobFailureError";
import type { FilesCallbackClient } from "../infrastructure/FilesCallbackClient";
import { FilesRequestRejected } from "../infrastructure/FilesCallbackClient";
import { captureWorkspace, restoreWorkspace } from "./spaceArchive";

/** What a Files run needs to restore and save the space's files. */
export interface FilesRun {
  jobId: string;
  tenantId: string;
  files: FilesWorkspacePayload;
  client: Pick<FilesCallbackClient, "storageGrant" | "checkpoint">;
  logger: Pick<Logger, "info" | "warn">;
  sendProgress: (step: string, message: string, details?: Record<string, unknown>) => Promise<void>;
}

const TRANSFER_TIMEOUT_MS = 10 * 60_000;

/**
 * Makes a fresh working directory holding the space's files as last saved.
 * A space whose saved files can't be restored fails the run here, before the
 * agent starts: starting empty would lose the space's work.
 */
export async function prepareFilesWorkspace(run: FilesRun, jobWorkDir: string): Promise<string> {
  const repoDir = path.join(jobWorkDir, "repo");
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true });
  await run.sendProgress("files-restore", "Preparing files", { baseSnapshotId: run.files.baseSnapshotId });
  if (!run.files.baseSnapshotId) return repoDir;

  const archive = path.join(jobWorkDir, `space-files-${run.files.baseSnapshotId}.tar.gz`);
  try {
    await withSpan("files.restore", {}, async () => {
      const grant = await run.client.storageGrant(run.jobId, run.tenantId, "read");
      const response = await fetch(grant.url, { signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
      if (!response.ok || !response.body) throw new Error(`Downloading the space's files failed (HTTP ${response.status})`);
      await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), fs.createWriteStream(archive));
      const restored = await restoreWorkspace(archive, repoDir);
      run.logger.info("Restored the space's files", { jobId: run.jobId, snapshotId: run.files.baseSnapshotId, ...restored });
    });
  } catch (error) {
    throw new JobFailureError(
      JOB_FAILURE_CODE.FILES_RESTORE_FAILED,
      `Couldn't restore the space's files, so the run stopped before the agent started: ${messageOf(error)}`,
    );
  } finally {
    fs.rmSync(archive, { force: true });
  }
  return repoDir;
}

/**
 * Saves the working directory as the space's next files. Uploading alone
 * changes nothing; the platform keeps the files only once it accepts the
 * save, so any failure here fails the run.
 */
export async function saveFilesWorkspace(
  run: FilesRun,
  repoDir: string,
  options: { partial: boolean },
): Promise<FilesCheckpointResult> {
  await run.sendProgress("files-save", "Saving files", { partial: options.partial });
  const archive = path.join(path.dirname(repoDir), `space-files-${run.files.checkpointSnapshotId}.tar.gz`);
  try {
    return await withSpan("files.save", { attributes: { "vg.files.partial": options.partial } }, async () => {
      const captured = await captureWorkspace(repoDir, archive);
      if (captured.skipped.length > 0) {
        run.logger.warn("Left links and special files out of the saved files", { jobId: run.jobId, skipped: captured.skipped.slice(0, 50) });
      }
      const grant = await run.client.storageGrant(run.jobId, run.tenantId, "write");
      const body = fs.readFileSync(archive);
      const response = await fetch(grant.url, {
        method: "PUT",
        body: new Uint8Array(body),
        // A byte body carries its own Content-Length, which a presigned PUT needs.
        headers: { "Content-Type": "application/gzip" },
        signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Uploading the space's files failed (HTTP ${response.status})`);
      const saved = await run.client.checkpoint(run.jobId, run.tenantId, {
        sha256: captured.sha256,
        archiveBytes: captured.archiveBytes,
        partial: options.partial,
      });
      run.logger.info("Saved the space's files", { jobId: run.jobId, snapshotId: saved.id, fileCount: saved.fileCount, partial: saved.partial });
      return saved;
    });
  } catch (error) {
    const reason = error instanceof FilesRequestRejected ? `the platform refused them: ${error.message}` : messageOf(error);
    throw new JobFailureError(JOB_FAILURE_CODE.FILES_SAVE_FAILED, `Couldn't save the space's files: ${reason}`);
  } finally {
    fs.rmSync(archive, { force: true });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
