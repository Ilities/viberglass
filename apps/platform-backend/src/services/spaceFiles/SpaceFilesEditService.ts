import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import {
  SPACE_FILES_RESERVED_PATHS,
  SPACE_TEXT_FILE_EXTENSIONS,
  SPACE_TEXT_FILE_MAX_BYTES,
  type SaveSpaceTextFileRequest,
  type SpaceFilesListing,
  type SpaceFilesManifestEntry,
  type SpaceFilesSnapshotSummary,
  type SpaceTextFile,
} from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { SpaceFilesDAO, type SpaceFileSnapshot } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { ArtifactRegistrar } from "../artifacts/ArtifactRegistrar";
import { contentTypeOf } from "../artifacts/artifactDeclarations";
import { compareManifests, inspectSpaceArchive, normalizeArchivePath } from "./inspectSpaceArchive";
import { openFile, readArchiveFile, repackArchive, type SpaceFileChange } from "./spaceArchiveFiles";
import { S3SpaceFilesStore, snapshotStorageUrl, type SpaceFilesStore } from "./SpaceFilesStore";
import { spaceFilesRuns } from "./SpaceFilesRunService";

const logger = createChildLogger({ service: "SpaceFilesEditService" });

/** How long a person's change may hold the space; it's one upload or save. */
const OPERATION_LEASE_MS = 2 * 60_000;

export class SpaceFileError extends Error {
  constructor(
    readonly code: "SPACE_BUSY" | "FILE_CHANGED" | "FILE_NOT_FOUND" | "INVALID_PATH" | "NOT_TEXT",
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

function isTextPath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return path.includes(".") && (SPACE_TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension);
}

const sha256 = (content: Buffer) => createHash("sha256").update(content).digest("hex");

/**
 * What people do with a Files space's working files: list, read and download
 * them, and upload, edit or delete one at a time. Each change holds the space
 * like a run does, so it never overwrites a run's work or another person's.
 */
export class SpaceFilesEditService {
  constructor(
    private readonly dao: SpaceFilesDAO = new SpaceFilesDAO(),
    private readonly store: SpaceFilesStore = new S3SpaceFilesStore(),
    private readonly registrar: Pick<ArtifactRegistrar, "fromEdit" | "storeFiles"> = new ArtifactRegistrar(store),
    private readonly runs: Pick<typeof spaceFilesRuns, "startWaiting"> = spaceFilesRuns,
  ) {}

  async list(projectId: string): Promise<SpaceFilesListing> {
    const { snapshot, busy } = await this.dao.getCurrent(projectId);
    return { snapshot: snapshot ? summaryOf(snapshot) : null, files: snapshot?.manifest ?? [], busy };
  }

  async download(projectId: string, rawPath: unknown): Promise<{ path: string; content: Buffer; contentType: string }> {
    const path = typeof rawPath === "string" ? rawPath : "";
    const { snapshot } = await this.dao.getCurrent(projectId);
    const entry = snapshot?.manifest.find((file) => file.path === path);
    if (!snapshot || !entry) throw new SpaceFileError("FILE_NOT_FOUND", "That file isn't in the space's files.");
    const content = await readArchiveFile(await this.store.open(snapshot.storageUrl), path);
    if (!content) throw new SpaceFileError("FILE_NOT_FOUND", "That file isn't in the space's files.");
    return { path, content, contentType: contentTypeOf(path) };
  }

  async readText(projectId: string, rawPath: unknown): Promise<SpaceTextFile> {
    const path = typeof rawPath === "string" ? rawPath : "";
    if (!isTextPath(path)) throw new SpaceFileError("NOT_TEXT", "Only Markdown and plain text files open in the editor.");
    const { snapshot } = await this.dao.getCurrent(projectId);
    const entry = snapshot?.manifest.find((file) => file.path === path);
    if (!entry) throw new SpaceFileError("FILE_NOT_FOUND", "That file isn't in the space's files.");
    if (entry.bytes > SPACE_TEXT_FILE_MAX_BYTES) throw new SpaceFileError("NOT_TEXT", "The file is too large to edit here; download it instead.");
    const { content } = await this.download(projectId, path);
    return { path, content: content.toString("utf-8"), sha256: sha256(content) };
  }

  /** Saves text the person edited, refusing when the file changed since they opened it. */
  async saveText(projectId: string, userId: string, request: SaveSpaceTextFileRequest): Promise<{ snapshot: SpaceFilesSnapshotSummary; file: SpaceTextFile }> {
    const path = editablePath(request.path);
    if (!isTextPath(path)) throw new SpaceFileError("NOT_TEXT", "Only Markdown and plain text files can be edited here.");
    const content = Buffer.from(request.content, "utf-8");
    if (content.length > SPACE_TEXT_FILE_MAX_BYTES) throw new SpaceFileError("NOT_TEXT", "The text is too large to save here.");
    const snapshot = await this.apply(projectId, userId, { kind: "write", path, content }, (files) => {
      const current = files.find((file) => file.path === path);
      if ((current?.sha256 ?? null) !== request.baseSha256) {
        throw new SpaceFileError(
          "FILE_CHANGED",
          current ? "Someone changed this file since you opened it. Reload it to see their version." : "This file was removed since you opened it.",
        );
      }
    });
    return { snapshot, file: { path, content: request.content, sha256: sha256(content) } };
  }

  async upload(projectId: string, userId: string, rawPath: unknown, content: Buffer): Promise<SpaceFilesSnapshotSummary> {
    return this.apply(projectId, userId, { kind: "write", path: editablePath(rawPath), content });
  }

  async remove(projectId: string, userId: string, rawPath: unknown): Promise<SpaceFilesSnapshotSummary> {
    const path = editablePath(rawPath);
    return this.apply(projectId, userId, { kind: "remove", path }, (files) => {
      if (!files.some((file) => file.path === path)) throw new SpaceFileError("FILE_NOT_FOUND", "That file isn't in the space's files.");
    });
  }

  private async apply(
    projectId: string,
    userId: string,
    change: SpaceFileChange,
    check?: (files: SpaceFilesManifestEntry[]) => void,
  ): Promise<SpaceFilesSnapshotSummary> {
    const operationId = randomUUID();
    const lease = await this.dao.acquireForOperation(projectId, operationId, OPERATION_LEASE_MS);
    if (!lease) {
      throw new SpaceFileError("SPACE_BUSY", "An agent or someone else is changing this space's files. Try again when they're saved.");
    }
    let repacked: Awaited<ReturnType<typeof repackArchive>> | null = null;
    try {
      const current = lease.currentSnapshotId ? await this.dao.getSnapshot(lease.currentSnapshotId) : null;
      check?.(current?.manifest ?? []);
      repacked = await repackArchive(current ? await this.store.open(current.storageUrl) : null, change);
      const archivePath = repacked.archivePath;
      const archive = await inspectSpaceArchive(openFile(archivePath));
      const snapshotId = randomUUID();
      const storageUrl = snapshotStorageUrl(this.store.bucket(), projectId, snapshotId);
      await this.store.put(storageUrl, await fs.readFile(archivePath), archive.archiveBytes, "application/gzip");

      const source = { projectId, ticketId: null, jobId: null, createdBy: userId, snapshotId };
      const versions = change.kind === "write" ? await this.registrar.fromEdit(change.path, archive.manifest, source) : [];
      await this.registrar.storeFiles(async () => openFile(archivePath), versions);

      const committed = await this.dao.commitOperation(
        operationId,
        lease.token,
        {
          id: snapshotId,
          projectId,
          parentId: current?.id ?? null,
          jobId: null,
          createdBy: userId,
          storageUrl,
          archiveSha256: archive.sha256,
          archiveBytes: archive.archiveBytes,
          totalBytes: archive.totalBytes,
          manifest: archive.manifest,
          changes: compareManifests(current?.manifest ?? [], archive.manifest),
          partial: false,
        },
        versions,
      );
      if (committed === "lease_lost") {
        throw new SpaceFileError("SPACE_BUSY", "Saving took too long and another change got there first. Try again.");
      }
      logger.info("Saved a person's change to a Files space", { projectId, userId, kind: change.kind, path: change.path, artifacts: committed.artifacts.length });
      return summaryOf(committed.snapshot);
    } finally {
      await this.dao.releaseOperation(projectId, operationId);
      await repacked?.cleanup();
      this.runs.startWaiting(projectId);
    }
  }
}

function summaryOf(snapshot: SpaceFileSnapshot): SpaceFilesSnapshotSummary {
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
