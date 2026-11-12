import type { Pin, PinTarget } from "@viberglass/types";
import { PinsDAO, type PinRow } from "../../persistence/pins/PinsDAO";
import { AppOrigins } from "../apps/AppOrigins";
import { ArtifactPreviewLinks } from "../artifacts/ArtifactPreviewLinks";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";

/** Pinning something the person can't see, or that can't be pinned. */
export class PinTargetNotFound extends Error {}

interface Dependencies {
  pins: Pick<PinsDAO, "list" | "add" | "remove" | "reorder" | "markOpened" | "describe">;
  access: Pick<SpaceAccessService, "visibleProjectIds">;
  previewLinks: Pick<ArtifactPreviewLinks, "link">;
  origins: Pick<AppOrigins, "originFor">;
  now: () => Date;
}

/** What a person pinned to Home, each shown as it is now. Pins are private to their person. */
export class PinsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      pins: new PinsDAO(),
      access: new SpaceAccessService(),
      previewLinks: new ArtifactPreviewLinks(),
      origins: new AppOrigins(),
      now: () => new Date(),
      ...deps,
    };
  }

  async list(viewer: SpaceViewer): Promise<Pin[]> {
    const [rows, visible] = await Promise.all([this.deps.pins.list(viewer.id), this.deps.access.visibleProjectIds(viewer)]);
    return rows.map((row) => (visible === null || visible.includes(row.projectId) ? this.toPin(row) : { id: row.id, target: row.target, title: row.title, kind: row.target.kind, available: false }));
  }

  async pin(viewer: SpaceViewer, target: PinTarget): Promise<Pin[]> {
    const described = await this.deps.pins.describe(target);
    const visible = await this.deps.access.visibleProjectIds(viewer);
    if (!described || (visible !== null && !visible.includes(described.projectId))) throw new PinTargetNotFound();
    await this.deps.pins.add(viewer.id, target, described.title);
    return this.list(viewer);
  }

  async unpin(viewer: SpaceViewer, pinId: string): Promise<Pin[]> {
    await this.deps.pins.remove(viewer.id, pinId);
    return this.list(viewer);
  }

  async reorder(viewer: SpaceViewer, pinIds: string[]): Promise<Pin[]> {
    await this.deps.pins.reorder(viewer.id, pinIds);
    return this.list(viewer);
  }

  async opened(viewer: SpaceViewer, target: PinTarget): Promise<void> {
    await this.deps.pins.markOpened(viewer.id, target, this.deps.now());
  }

  private toPin(row: PinRow): Pin {
    if (row.target.kind === "app") {
      return {
        id: row.id,
        target: row.target,
        title: row.currentTitle,
        kind: "app",
        available: true,
        spaceSlug: row.projectSlug,
        spaceName: row.projectName,
        release: row.release ? { ...row.release, createdAt: row.release.createdAt.toISOString() } : null,
        running: row.appRunning,
        appUrl: this.deps.origins.originFor(row.projectSlug),
      };
    }
    const version = row.artifactVersion;
    const isImage = version !== null && (version.format === "image" || version.format === "svg");
    return {
      id: row.id,
      target: row.target,
      title: row.currentTitle,
      kind: "artifact",
      available: true,
      spaceId: row.projectId,
      spaceSlug: row.projectSlug,
      spaceName: row.projectName,
      current: version
        ? { versionId: version.versionId, number: version.number, format: version.format, cover: version.cover, createdAt: version.createdAt.toISOString() }
        : null,
      imageUrl: isImage ? (this.deps.previewLinks.link(version.versionId, version.entrypoint, this.deps.now().getTime())?.url ?? null) : null,
      hasNewVersion: version !== null && version.createdAt > (row.lastOpenedAt ?? row.createdAt),
    };
  }
}
