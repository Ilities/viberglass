import { type OutputItem, type OutputsPage, type OutputsQuery, type OutputsSummary } from "@viberglass/types";
import { ArtifactOutputsDAO } from "../../persistence/outputs/ArtifactOutputsDAO";
import { PreviewOutputsDAO } from "../../persistence/outputs/PreviewOutputsDAO";
import { ReleaseOutputsDAO } from "../../persistence/outputs/ReleaseOutputsDAO";
import { compareOutputs, decodeCursor, encodeCursor, type OutputFilter } from "../../persistence/outputs/outputQuery";
import { ArtifactPreviewLinks } from "../artifacts/ArtifactPreviewLinks";
import { AppOrigins } from "../apps/AppOrigins";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";

export const OUTPUTS_PAGE_SIZE = 24;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface Dependencies {
  access: Pick<SpaceAccessService, "visibleProjectIds">;
  artifacts: Pick<ArtifactOutputsDAO, "list" | "countByKind" | "madeSince">;
  releases: Pick<ReleaseOutputsDAO, "list" | "count" | "madeSince">;
  previews: Pick<PreviewOutputsDAO, "list" | "count">;
  previewLinks: Pick<ArtifactPreviewLinks, "link">;
  origins: Pick<AppOrigins, "originFor">;
  now: () => Date;
}

/** Outputs: what agents and people made across the spaces a person sees, newest first. */
export class OutputsService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      access: new SpaceAccessService(),
      artifacts: new ArtifactOutputsDAO(),
      releases: new ReleaseOutputsDAO(),
      previews: new PreviewOutputsDAO(),
      previewLinks: new ArtifactPreviewLinks(),
      origins: new AppOrigins(),
      now: () => new Date(),
      ...deps,
    };
  }

  async page(viewer: SpaceViewer, query: OutputsQuery, limit = OUTPUTS_PAGE_SIZE): Promise<OutputsPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const filter = await this.filterFor(viewer, query);
    const [artifacts, releases, previews] = await Promise.all([
      this.deps.artifacts.list(filter, cursor, limit + 1),
      this.deps.releases.list(filter, cursor, limit + 1),
      this.deps.previews.list(filter, cursor, limit + 1),
    ]);
    const merged: OutputItem[] = [
      ...artifacts,
      ...releases.map((release) => ({ ...release, appUrl: this.deps.origins.originFor(release.spaceSlug) })),
      ...previews,
    ].sort(compareOutputs);
    const items = merged.slice(0, limit).map((item) => this.withImageLink(item));
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: merged.length > limit && last ? encodeCursor({ at: new Date(last.createdAt), id: last.id }) : null,
    };
  }

  async summary(viewer: SpaceViewer, query: OutputsQuery): Promise<OutputsSummary> {
    const filter = await this.filterFor(viewer, { ...query, kind: undefined });
    const since = new Date(this.deps.now().getTime() - WEEK_MS);
    const [byKind, releases, previews, artifactWeek, releaseWeek] = await Promise.all([
      this.deps.artifacts.countByKind(filter),
      this.deps.releases.count(filter),
      this.deps.previews.count(filter),
      this.deps.artifacts.madeSince(filter.projectIds, since),
      this.deps.releases.madeSince(filter.projectIds, since),
    ]);
    const counts: OutputsSummary["counts"] = { all: 0, app: 0, deck: 0, doc: 0, data: 0, pdf: 0, image: 0 };
    for (const { kind, count } of byKind) {
      if (kind) counts[kind] += count;
      counts.all += count;
    }
    counts.app = releases + previews;
    counts.all += counts.app;
    const week = [...artifactWeek, ...releaseWeek];
    return {
      counts,
      week: {
        made: week.reduce((sum, row) => sum + row.count, 0),
        spaces: new Set(week.map((row) => row.projectId)).size,
        releasesLive: releaseWeek.reduce((sum, row) => sum + row.live, 0),
      },
    };
  }

  private async filterFor(viewer: SpaceViewer, query: OutputsQuery): Promise<OutputFilter> {
    return {
      projectIds: await this.deps.access.visibleProjectIds(viewer),
      spaceId: query.spaceId,
      kind: query.kind,
      producer: query.producer,
      q: query.q,
      latest: query.latest ?? false,
    };
  }

  /** An image is its own cover, so it gets a link to itself. */
  private withImageLink(item: OutputItem): OutputItem {
    if (item.type !== "artifact" || item.kind !== "image" || item.expired) return item;
    const link = this.deps.previewLinks.link(item.versionId, item.entrypoint, this.deps.now().getTime());
    return { ...item, imageUrl: link?.url ?? null };
  }
}
