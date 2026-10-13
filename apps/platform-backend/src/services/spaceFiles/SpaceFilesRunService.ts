import { randomUUID } from "crypto";
import {
  isObjectRecord,
  type FilesCheckpointRequest,
  type FilesCheckpointResult,
  type FilesStorageGrant,
  type FilesStorageOperation,
  type FilesWorkspacePayload,
  type SpaceFilesSnapshotSummary,
  type TurnArtifact,
} from "@viberglass/types";
import { ArtifactDAO, type NewArtifactVersion } from "../../persistence/artifacts/ArtifactDAO";
import { ArtifactRegistrar } from "../artifacts/ArtifactRegistrar";
import { createChildLogger } from "../../config/logger";
import { SpaceFilesDAO, type SpaceFileRun, type SpaceFileSnapshot } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { JobBootstrapService } from "../job/JobBootstrapService";
import { compareManifests, inspectSpaceArchive, InvalidSpaceArchive } from "./inspectSpaceArchive";
import { S3SpaceFilesStore, snapshotStorageUrl, type SpaceFilesStore } from "./SpaceFilesStore";

const logger = createChildLogger({ service: "SpaceFilesRunService" });

/** How long a run keeps its space without a heartbeat; heartbeats come every minute. */
export const SPACE_LEASE_MS = 10 * 60_000;
/** How long a stopped run's worker may still save its files; workers get 20–30 seconds after SIGTERM. */
export const STOP_SAVE_MS = 60_000;
const GRANT_SECONDS = 300;
export const WAITING_MESSAGE = "Waiting for another run to save this space";

/** The run may not touch the space's files: it isn't running, or it lost the space. */
export class SpaceFilesDenied extends Error {}
/** The run's files can't become the space's files; saving them again won't help. */
export class SpaceFilesConflict extends Error {}
export { InvalidSpaceArchive };

/** Starts the worker for a run that has just been given its space. */
export type FilesRunLauncher = (run: SpaceFileRun) => Promise<void>;

/** People's changes that waited for the space; they're saved before the next run starts. */
export interface WaitingChanges {
  applyWaiting(projectId: string): Promise<void>;
  spacesWithWaiting(): Promise<string[]>;
}

/**
 * One writer at a time per Files space. A run waits for the space's lease,
 * starts from the space's current files, and its saved files become the
 * current ones only while it still holds the lease and nothing else was
 * saved in between.
 */
export class SpaceFilesRunService {
  private launcher: FilesRunLauncher | null = null;
  private changes: WaitingChanges | null = null;

  // Built on first use: the shared instance below is created when its module loads.
  constructor(
    private daoOverride?: SpaceFilesDAO,
    private storeOverride?: SpaceFilesStore,
    private bootstrapsOverride?: Pick<JobBootstrapService, "getBootstrapPayload">,
    private artifactsOverride?: Pick<ArtifactDAO, "listForJob">,
    private registrarOverride?: Pick<ArtifactRegistrar, "fromDeclaration" | "storeFiles">,
  ) {}

  private get artifacts(): Pick<ArtifactDAO, "listForJob"> {
    return (this.artifactsOverride ??= new ArtifactDAO());
  }

  private get registrar(): Pick<ArtifactRegistrar, "fromDeclaration" | "storeFiles"> {
    return (this.registrarOverride ??= new ArtifactRegistrar(this.store));
  }

  private get dao(): SpaceFilesDAO {
    return (this.daoOverride ??= new SpaceFilesDAO());
  }

  private get store(): SpaceFilesStore {
    return (this.storeOverride ??= new S3SpaceFilesStore());
  }

  private get bootstraps(): Pick<JobBootstrapService, "getBootstrapPayload"> {
    return (this.bootstrapsOverride ??= new JobBootstrapService());
  }

  /** Set by the composition root, which knows how to start a turn's worker. */
  setLauncher(launcher: FilesRunLauncher): void {
    this.launcher = launcher;
  }

  /** Set by the composition root, which owns the queue of people's changes. */
  setWaitingChanges(changes: WaitingChanges): void {
    this.changes = changes;
  }

  /** Queues the job for its space; it starts at once when the space is free. */
  async enqueue(jobId: string, projectId: string): Promise<SpaceFileRun | null> {
    await this.dao.createRun(jobId, projectId, randomUUID());
    const started = await this.dao.startNextWaiting(projectId, SPACE_LEASE_MS);
    if (started?.jobId === jobId) return started;
    await this.dao.setWaitingProgress(jobId, WAITING_MESSAGE);
    // Another waiting run got the space first; start it.
    if (started) await this.launch(started);
    return null;
  }

  payloadFor(run: SpaceFileRun): FilesWorkspacePayload {
    return { spaceId: run.projectId, baseSnapshotId: run.baseSnapshotId, checkpointSnapshotId: run.checkpointSnapshotId };
  }

  async grant(jobId: string, tenantId: string, operation: FilesStorageOperation): Promise<FilesStorageGrant> {
    // A stopped run may still save what it had, but not start reading.
    const { run } = await this.activeRun(jobId, tenantId, operation === "write");
    const bucket = this.store.bucket();
    if (!bucket) throw new Error("File storage is not configured");
    let storageUrl: string;
    if (operation === "read") {
      if (!run.baseSnapshotId) throw new SpaceFilesDenied("This space has no saved files to read");
      const base = await this.dao.getSnapshot(run.baseSnapshotId);
      if (!base) throw new SpaceFilesDenied("The run's starting files are no longer available");
      storageUrl = base.storageUrl;
    } else {
      storageUrl = snapshotStorageUrl(bucket, run.projectId, run.checkpointSnapshotId);
    }
    return {
      url: await this.store.sign(operation, storageUrl, GRANT_SECONDS),
      expiresAt: new Date(Date.now() + GRANT_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Checks the uploaded archive and makes it the space's current files, with
   * the artifact versions the run declared when it was asked for one. Safe to
   * repeat: a repeat answers with what was saved the first time.
   */
  async checkpoint(jobId: string, tenantId: string, request: FilesCheckpointRequest): Promise<FilesCheckpointResult> {
    const existing = await this.dao.getRun(jobId);
    if (existing?.status === "saved") {
      const saved = await this.dao.getSnapshot(existing.checkpointSnapshotId);
      if (saved) return { ...summary(saved), artifacts: await this.artifacts.listForJob(jobId), artifactError: null };
    }
    const { run, payload, stopped } = await this.activeRun(jobId, tenantId, true);
    // What a stopped run saves is what it had so far, never a finished artifact.
    const partial = request.partial || stopped;
    const bucket = this.store.bucket();
    const storageUrl = snapshotStorageUrl(bucket, run.projectId, run.checkpointSnapshotId);

    let archive;
    try {
      archive = await inspectSpaceArchive(await this.store.open(storageUrl));
    } catch (error) {
      if (error instanceof InvalidSpaceArchive) throw error;
      if (isMissingObject(error)) throw new InvalidSpaceArchive("The run's files were not uploaded");
      throw error;
    }
    if (archive.sha256 !== request.sha256.toLowerCase() || archive.archiveBytes !== request.archiveBytes) {
      throw new InvalidSpaceArchive("The uploaded files don't match what the run reported");
    }

    // Only a run asked for an artifact keeps one; its files are saved either way.
    let versions: NewArtifactVersion[] = [];
    let artifactError: string | null = null;
    if (!partial && payload.turnAction === "code") {
      if (request.artifactManifestError) {
        artifactError = request.artifactManifestError;
      } else {
        const declared = await this.registrar.fromDeclaration(request.artifactManifest ?? null, archive.manifest, {
          projectId: run.projectId,
          ticketId: ticketIdOf(payload),
          jobId,
          createdBy: null,
          snapshotId: run.checkpointSnapshotId,
        });
        if ("error" in declared) artifactError = declared.error;
        else versions = declared.versions;
      }
      await this.registrar.storeFiles(() => this.store.open(storageUrl), versions);
    }

    const parent = run.baseSnapshotId ? await this.dao.getSnapshot(run.baseSnapshotId) : null;
    const committed = await this.dao.commitCheckpoint(
      {
        id: run.checkpointSnapshotId,
        projectId: run.projectId,
        parentId: run.baseSnapshotId,
        jobId,
        createdBy: null,
        storageUrl,
        archiveSha256: archive.sha256,
        archiveBytes: archive.archiveBytes,
        totalBytes: archive.totalBytes,
        manifest: archive.manifest,
        changes: compareManifests(parent?.manifest ?? [], archive.manifest),
        partial,
      },
      versions,
    );
    if (typeof committed === "string") {
      // The upload stays in storage for diagnosis; it never becomes current.
      logger.warn("Refused a Files checkpoint", { jobId, projectId: run.projectId, reason: committed });
      throw new SpaceFilesConflict(
        committed === "space_moved_on"
          ? "Another run saved this space's files first, so this run's files weren't saved."
          : "This run no longer holds its space, so its files weren't saved.",
      );
    }
    logger.info("Saved a Files space's files", {
      jobId,
      projectId: run.projectId,
      snapshotId: committed.snapshot.id,
      files: committed.snapshot.fileCount,
      artifacts: committed.artifacts.length,
    });
    this.launchNextSoon(run.projectId);
    return { ...summary(committed.snapshot), artifacts: committed.artifacts, artifactError };
  }

  /** Starts the oldest waiting run if the space is free, after something else let it go. */
  startWaiting(projectId: string): void {
    this.launchNextSoon(projectId);
  }

  /** Keeps a live run's space while its worker sends heartbeats. */
  async renew(jobId: string): Promise<void> {
    await this.dao.renewLease(jobId, SPACE_LEASE_MS);
  }

  /**
   * The job was stopped: a running run keeps its space a little longer, so
   * its worker can save what it had; a waiting one just ends.
   */
  async stop(jobId: string): Promise<void> {
    if (await this.dao.shortenLease(jobId, STOP_SAVE_MS)) return;
    await this.release(jobId);
  }

  /** The job ended: free its space if it held it, and start whoever waits. */
  async release(jobId: string): Promise<void> {
    const projectId = await this.dao.release(jobId);
    if (projectId) this.launchNextSoon(projectId);
  }

  async summaryForJob(jobId: string): Promise<SpaceFilesSnapshotSummary | null> {
    const snapshot = await this.dao.getSnapshotForJob(jobId);
    return snapshot ? summary(snapshot) : null;
  }

  async artifactsForJob(jobId: string): Promise<TurnArtifact[]> {
    return this.artifacts.listForJob(jobId);
  }

  /** Recovers from missed releases and restarts: ends runs of finished jobs and starts waiting ones. */
  async sweep(): Promise<number> {
    let done = 0;
    for (const jobId of await this.dao.listRunsOfFinishedJobs()) {
      await this.dao.release(jobId);
      done++;
    }
    const spaces = new Set([...(await this.dao.listStartableSpaces()), ...((await this.changes?.spacesWithWaiting()) ?? [])]);
    for (const projectId of spaces) {
      if (await this.launchNext(projectId)) done++;
    }
    return done;
  }

  private async launchNext(projectId: string): Promise<boolean> {
    await this.changes?.applyWaiting(projectId);
    const run = await this.dao.startNextWaiting(projectId, SPACE_LEASE_MS);
    if (!run) return false;
    await this.launch(run);
    return true;
  }

  private launchNextSoon(projectId: string): void {
    void this.launchNext(projectId).catch((error: unknown) =>
      logger.error("Could not start the next Files run", { projectId, error: error instanceof Error ? error.message : String(error) }),
    );
  }

  private async launch(run: SpaceFileRun): Promise<void> {
    if (!this.launcher) {
      logger.error("No launcher for Files runs; the run stays waiting", { jobId: run.jobId });
      await this.dao.release(run.jobId);
      return;
    }
    try {
      await this.launcher(run);
    } catch (error) {
      logger.error("Could not start a Files run", { jobId: run.jobId, error: error instanceof Error ? error.message : String(error) });
      await this.release(run.jobId);
    }
  }

  /** The run, while it holds its space; a cancelled one only when `orStopped` and it still holds it. */
  private async activeRun(
    jobId: string,
    tenantId: string,
    orStopped = false,
  ): Promise<{ run: SpaceFileRun; payload: Record<string, unknown>; stopped: boolean }> {
    const bootstrap = await this.bootstraps.getBootstrapPayload(jobId);
    const stopped = bootstrap?.status === "cancelled";
    if (!bootstrap || bootstrap.tenantId !== tenantId || !(bootstrap.status === "active" || (orStopped && stopped))) {
      throw new SpaceFilesDenied("Files are only available to this active run");
    }
    const run = await this.dao.getRun(jobId);
    if (!run || run.status !== "running" || !(await this.dao.holdsLease(run))) {
      throw new SpaceFilesDenied("This run doesn't hold its space's files");
    }
    return { run, payload: bootstrap.payload ?? {}, stopped };
  }
}

function ticketIdOf(payload: Record<string, unknown>): string | null {
  const context = payload.context;
  return isObjectRecord(context) && typeof context.ticketId === "string" ? context.ticketId : null;
}

function summary(snapshot: SpaceFileSnapshot): SpaceFilesSnapshotSummary {
  return {
    id: snapshot.id,
    parentId: snapshot.parentId,
    fileCount: snapshot.fileCount,
    totalBytes: snapshot.totalBytes,
    partial: snapshot.partial,
    changes: snapshot.changes,
    createdAt: snapshot.createdAt,
  };
}

function isMissingObject(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error.name === "NoSuchKey" || error.name === "NotFound");
}

/** The backend's one coordinator, so job endings anywhere free the space. */
export const spaceFilesRuns = new SpaceFilesRunService();
