import { createHash } from "crypto";
import type { Readable } from "stream";
import type { ArtifactVersionFile, SpaceFilesManifestEntry } from "@viberglass/types";
import { ArtifactDAO, type NewArtifactVersion } from "../../persistence/artifacts/ArtifactDAO";
import { readArchiveFiles } from "../spaceFiles/spaceArchiveFiles";
import { artifactVersionPrefix, objectUrlUnder, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { InvalidArtifactDeclaration, resolveArtifactDeclarations } from "./artifactDeclarations";

/** A stable id from a seed, so saving the same files again names the same artifacts and versions. */
export function derivedId(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface VersionSource {
  projectId: string;
  ticketId: string | null;
  jobId: string | null;
  createdBy: string | null;
  snapshotId: string;
}

/**
 * Turns what a run declared, or a person's edit, into artifact versions: checks
 * them against the saved files and the task, then copies their files out of
 * the saved archive so later changes to the working files never touch them.
 */
export class ArtifactRegistrar {
  constructor(
    private readonly store: SpaceFilesStore,
    private readonly artifacts: Pick<ArtifactDAO, "revisableIds" | "listCurrentWithPath"> = new ArtifactDAO(),
  ) {}

  /** The versions a run's declaration makes, or why it can't make any. */
  async fromDeclaration(
    raw: unknown,
    saved: SpaceFilesManifestEntry[],
    source: VersionSource,
  ): Promise<{ versions: NewArtifactVersion[] } | { error: string }> {
    let resolved;
    try {
      resolved = resolveArtifactDeclarations(raw, saved);
    } catch (error) {
      if (error instanceof InvalidArtifactDeclaration) return { error: error.message };
      throw error;
    }
    const revised = resolved.flatMap((declaration) => (declaration.artifactId ? [declaration.artifactId] : []));
    const allowed = await this.artifacts.revisableIds(source.projectId, source.ticketId, revised);
    const foreign = resolved.find((declaration) => declaration.artifactId && !allowed.has(declaration.artifactId));
    if (foreign) return { error: `"${foreign.title}" names artifact ${foreign.artifactId}, which isn't one of this task's artifacts.` };

    return {
      versions: resolved.map((declaration, index) => {
        const artifactId = declaration.artifactId ?? derivedId(`${source.snapshotId}:artifact:${index}`);
        return this.version(source, {
          artifactId,
          create: !declaration.artifactId,
          versionId: derivedId(`${source.snapshotId}:version:${artifactId}`),
          title: declaration.title,
          format: declaration.format,
          entrypoint: declaration.entrypoint,
          files: declaration.files,
        });
      }),
    };
  }

  /** New versions of the artifacts a person's edit touched: their current files, as saved now. */
  async fromEdit(path: string, saved: SpaceFilesManifestEntry[], source: VersionSource): Promise<NewArtifactVersion[]> {
    const byPath = new Map(saved.map((entry) => [entry.path, entry]));
    const touched = await this.artifacts.listCurrentWithPath(source.projectId, path);
    return touched.flatMap((current) => {
      if (!byPath.has(current.entrypoint)) return [];
      const files = current.files.flatMap((file) => {
        const entry = byPath.get(file.path);
        return entry ? [{ ...entry, contentType: file.contentType }] : [];
      });
      return [
        this.version(source, {
          artifactId: current.artifactId,
          create: false,
          versionId: derivedId(`${source.snapshotId}:version:${current.artifactId}`),
          title: current.title,
          format: current.format,
          entrypoint: current.entrypoint,
          files,
        }),
      ];
    });
  }

  /** Copies each version's files out of the saved archive into the version's own place in storage. */
  async storeFiles(openArchive: () => Promise<Readable>, versions: NewArtifactVersion[]): Promise<void> {
    if (versions.length === 0) return;
    const targets = new Map<string, Array<{ url: string; contentType: string }>>();
    for (const version of versions) {
      for (const file of version.files) {
        const list = targets.get(file.path) ?? [];
        list.push({ url: objectUrlUnder(version.storagePrefix, file.path), contentType: file.contentType });
        targets.set(file.path, list);
      }
    }
    await readArchiveFiles(await openArchive(), (path) => targets.has(path), async (path, content) => {
      for (const target of targets.get(path) ?? []) await this.store.put(target.url, content, content.length, target.contentType);
    });
  }

  private version(
    source: VersionSource,
    fields: Pick<NewArtifactVersion, "artifactId" | "create" | "versionId" | "title" | "format" | "entrypoint"> & { files: ArtifactVersionFile[] },
  ): NewArtifactVersion {
    return {
      ...fields,
      projectId: source.projectId,
      ticketId: source.ticketId,
      snapshotId: source.snapshotId,
      jobId: source.jobId,
      createdBy: source.createdBy,
      storagePrefix: artifactVersionPrefix(this.store.bucket(), source.projectId, fields.artifactId, fields.versionId),
      totalBytes: fields.files.reduce((sum, file) => sum + file.bytes, 0),
    };
  }
}
