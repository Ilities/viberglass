import { createHash } from "crypto";
import {
  SPACE_TEXT_FILE_MAX_BYTES,
  type SaveSpaceTextFileRequest,
  type SpaceFileChangeResult,
  type SpaceFileChangeSummary,
  type SpaceFilesListing,
  type SpaceFilesManifestEntry,
  type SpaceFilesSnapshotSummary,
  type SpaceTextFile,
} from "@viberglass/types";
import { SpaceFilesDAO } from "../../persistence/spaceFiles/SpaceFilesDAO";
import { contentTypeOf } from "../artifacts/artifactDeclarations";
import { SpaceFileChangeApplier, summaryOf } from "./SpaceFileChangeApplier";
import { SpaceFileChangeQueue } from "./SpaceFileChangeQueue";
import { editablePath, exists, isTextPath, SpaceFileError, unchangedSince } from "./SpaceFileError";
import { readArchiveFile, type SpaceFileChange } from "./spaceArchiveFiles";
import { S3SpaceFilesStore, type SpaceFilesStore } from "./SpaceFilesStore";
import { spaceFilesRuns } from "./SpaceFilesRunService";

export { editablePath, SpaceFileError };

const sha256 = (content: Buffer) => createHash("sha256").update(content).digest("hex");

/**
 * What people do with a Files space's working files: list, read and download
 * them, and upload, edit or delete one at a time. A change made while a run
 * holds the space waits for it, and is saved before the next run starts.
 */
export class SpaceFilesEditService {
  constructor(
    private readonly dao: Pick<SpaceFilesDAO, "getCurrent"> = new SpaceFilesDAO(),
    private readonly store: SpaceFilesStore = new S3SpaceFilesStore(),
    private readonly runs: Pick<typeof spaceFilesRuns, "startWaiting"> = spaceFilesRuns,
    private readonly applier: Pick<SpaceFileChangeApplier, "tryApply"> = new SpaceFileChangeApplier(undefined, store),
    private readonly queue: Pick<SpaceFileChangeQueue, "add" | "list" | "content" | "dismiss"> = new SpaceFileChangeQueue(runs, undefined, store),
  ) {}

  async list(projectId: string): Promise<SpaceFilesListing> {
    const { snapshot, busy } = await this.dao.getCurrent(projectId);
    return { snapshot: snapshot ? summaryOf(snapshot) : null, files: snapshot?.manifest ?? [], busy, changes: await this.queue.list(projectId) };
  }

  /** A waiting or failed change's content, to get back text a save couldn't keep. */
  async changeContent(projectId: string, changeId: string): Promise<{ path: string; content: Buffer; contentType: string }> {
    const { path, content } = await this.queue.content(projectId, changeId);
    return { path, content, contentType: contentTypeOf(path) };
  }

  async dismissChange(projectId: string, changeId: string): Promise<void> {
    await this.queue.dismiss(projectId, changeId);
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
  async saveText(
    projectId: string,
    userId: string,
    request: SaveSpaceTextFileRequest,
  ): Promise<{ snapshot: SpaceFilesSnapshotSummary; file: SpaceTextFile } | { queued: SpaceFileChangeSummary }> {
    const path = editablePath(request.path);
    if (!isTextPath(path)) throw new SpaceFileError("NOT_TEXT", "Only Markdown and plain text files can be edited here.");
    const content = Buffer.from(request.content, "utf-8");
    if (content.length > SPACE_TEXT_FILE_MAX_BYTES) throw new SpaceFileError("NOT_TEXT", "The text is too large to save here.");
    const result = await this.apply(projectId, userId, { kind: "write", path, content }, unchangedSince(path, request.baseSha256), {
      sha256: request.baseSha256,
    });
    if ("queued" in result) return result;
    return { snapshot: result.snapshot, file: { path, content: request.content, sha256: sha256(content) } };
  }

  async upload(projectId: string, userId: string, rawPath: unknown, content: Buffer): Promise<SpaceFileChangeResult> {
    return this.apply(projectId, userId, { kind: "write", path: editablePath(rawPath), content });
  }

  async remove(projectId: string, userId: string, rawPath: unknown): Promise<SpaceFileChangeResult> {
    const path = editablePath(rawPath);
    return this.apply(projectId, userId, { kind: "remove", path }, exists(path));
  }

  private async apply(
    projectId: string,
    userId: string,
    change: SpaceFileChange,
    check?: (files: SpaceFilesManifestEntry[]) => void,
    base?: { sha256: string | null },
  ): Promise<SpaceFileChangeResult> {
    let saved: SpaceFilesSnapshotSummary | null;
    try {
      saved = await this.applier.tryApply(projectId, userId, change, check);
    } finally {
      // A run may have queued while the change held the space.
      this.runs.startWaiting(projectId);
    }
    if (saved) return { snapshot: saved };
    // Refused now rather than after the run, when what it would refuse is already true.
    check?.((await this.dao.getCurrent(projectId)).snapshot?.manifest ?? []);
    return { queued: await this.queue.add(projectId, userId, change, base) };
  }
}
