import { Readable } from "stream";
import { zipSync } from "fflate";
import { ARTIFACT_LIMITS, type ArtifactDetail, type ArtifactPreview, type ArtifactSummary } from "@viberglass/types";
import { ArtifactDAO, type StoredArtifactVersion } from "../../persistence/artifacts/ArtifactDAO";
import { objectUrlUnder, S3SpaceFilesStore, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { ArtifactPreviewLinks } from "./ArtifactPreviewLinks";

/** Text previews stop here; the rest is in the download. */
const TEXT_PREVIEW_BYTES = 512 * 1024;

export class ArtifactNotFound extends Error {}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Reading a space's artifacts: what they are, how to show a version, and its files to download. */
export class ArtifactService {
  constructor(
    private readonly dao: ArtifactDAO = new ArtifactDAO(),
    private readonly store: SpaceFilesStore = new S3SpaceFilesStore(),
    private readonly links: ArtifactPreviewLinks = new ArtifactPreviewLinks(),
  ) {}

  list(projectId: string): Promise<ArtifactSummary[]> {
    return this.dao.listForSpace(projectId);
  }

  async detail(projectId: string, artifactId: string): Promise<ArtifactDetail> {
    const detail = await this.dao.getDetail(projectId, artifactId);
    if (!detail) throw new ArtifactNotFound("Artifact not found");
    return detail;
  }

  async preview(projectId: string, artifactId: string, versionId: string): Promise<ArtifactPreview> {
    const version = await this.version(projectId, artifactId, versionId);
    if (version.status === "expired") return { kind: "expired" };
    const entry = version.files.find((file) => file.path === version.entrypoint);
    if (!entry) return { kind: "download", reason: "This version's main file is missing." };

    switch (version.format) {
      case "markdown":
      case "text":
      case "json":
      case "csv": {
        const content = await readAll(await this.store.open(objectUrlUnder(version.storagePrefix, entry.path)));
        const truncated = content.length > TEXT_PREVIEW_BYTES;
        return { kind: "text", format: version.format, content: content.subarray(0, TEXT_PREVIEW_BYTES).toString("utf-8"), truncated };
      }
      case "html":
      case "image":
      case "pdf":
      case "svg": {
        if (entry.bytes > ARTIFACT_LIMITS.previewFileBytes) return { kind: "download", reason: "The file is too large to preview." };
        const link = this.links.link(version.id, version.entrypoint);
        if (!link) return { kind: "download", reason: "Previews aren't set up on this installation." };
        return { kind: "frame", format: version.format, ...link };
      }
      default:
        return { kind: "download", reason: "This kind of file can't be previewed." };
    }
  }

  /** One file as it is, or every file of a bundle in a zip. */
  async download(projectId: string, artifactId: string, versionId: string): Promise<{ filename: string; contentType: string; content: Buffer }> {
    const version = await this.version(projectId, artifactId, versionId);
    if (version.status === "expired") throw new ArtifactNotFound("This version is no longer kept");
    if (version.files.length === 1) {
      const [file] = version.files;
      return {
        filename: file.path.split("/").pop() ?? "artifact",
        contentType: file.contentType,
        content: await readAll(await this.store.open(objectUrlUnder(version.storagePrefix, file.path))),
      };
    }
    const entries: Record<string, Uint8Array> = {};
    for (const file of version.files) {
      entries[file.path] = await readAll(await this.store.open(objectUrlUnder(version.storagePrefix, file.path)));
    }
    const name = version.entrypoint.split("/").slice(0, -1).pop() || "artifact";
    return { filename: `${name}-v${version.number}.zip`, contentType: "application/zip", content: Buffer.from(zipSync(entries)) };
  }

  private async version(projectId: string, artifactId: string, versionId: string): Promise<StoredArtifactVersion> {
    const version = await this.dao.getVersion(projectId, artifactId, versionId);
    if (!version) throw new ArtifactNotFound("Artifact version not found");
    return version;
  }
}
