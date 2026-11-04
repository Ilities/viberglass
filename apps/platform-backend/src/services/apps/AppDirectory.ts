import type { OpenableApp, WorkspaceRole } from "@viberglass/types";
import type { AppAccessDAO } from "../../persistence/apps/AppAccessDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { SpaceAccessService } from "../spaces/SpaceAccessService";
import type { AppOrigins } from "./AppOrigins";

/** The apps one person may open: those in spaces they see, and those whose access list they're on. */
export class AppDirectory {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "listLive">,
    private readonly visibility: Pick<SpaceAccessService, "visibleProjectIds">,
    private readonly accessList: Pick<AppAccessDAO, "projectIdsFor">,
    private readonly origins: Pick<AppOrigins, "originFor">,
  ) {}

  async openableBy(viewer: { id: string; role: WorkspaceRole }): Promise<OpenableApp[]> {
    const [spaces, visible, listed] = await Promise.all([
      this.spaces.listLive(),
      this.visibility.visibleProjectIds(viewer),
      this.accessList.projectIdsFor(viewer.id),
    ]);
    const allowed = visible === null ? null : new Set([...visible, ...listed]);
    return spaces
      .filter((space) => !allowed || allowed.has(space.projectId))
      .map((space) => ({
        projectId: space.projectId,
        name: space.name,
        slug: space.slug,
        state: space.state,
        url: this.origins.originFor(space.slug),
      }));
  }
}
