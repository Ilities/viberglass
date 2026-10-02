import { canMaintainSpace, canSeeSpace, spaceCapabilities, type SpaceCapabilities, type SpaceRole, type WorkspaceRole } from "@viberglass/types";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { SpaceMemberDAO } from "../../persistence/project/SpaceMemberDAO";
import { SPACE_ACCESS_ERROR_CODE, SpaceAccessError } from "../errors/SpaceAccessError";

export interface SpaceViewer {
  id: string;
  role: WorkspaceRole;
}

export interface SpaceScope {
  projectId: string | undefined;
  projectIds: string[] | null;
}

interface Dependencies {
  projects: Pick<ProjectDAO, "getProject" | "findByName">;
  members: Pick<SpaceMemberDAO, "getRole" | "listVisibleProjectIds">;
}

/** The one place that decides who sees and maintains a space. */
export class SpaceAccessService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { projects: new ProjectDAO(), members: new SpaceMemberDAO(), ...deps };
  }

  /** Null means every space (admins); otherwise the ids this person may see. */
  async visibleProjectIds(viewer: SpaceViewer): Promise<string[] | null> {
    if (viewer.role === "admin") return null;
    return this.deps.members.listVisibleProjectIds(viewer.id, viewer.role !== "guest");
  }

  /**
   * What a list may show: one named space (which must be visible), or else
   * every visible space. `projectIds` null means no limit (admins).
   */
  async scopeFor(viewer: SpaceViewer, idOrSlug?: string): Promise<SpaceScope> {
    if (idOrSlug) return { projectId: (await this.assertCanSee(viewer, idOrSlug)).projectId, projectIds: null };
    return { projectId: undefined, projectIds: await this.visibleProjectIds(viewer) };
  }

  /** Resolves a space by id or slug, refusing one this person can't see. */
  async assertCanSee(viewer: SpaceViewer, idOrSlug: string): Promise<{ projectId: string; membership: SpaceRole | null }> {
    const project = UUID.test(idOrSlug)
      ? await this.deps.projects.getProject(idOrSlug)
      : await this.deps.projects.findByName(idOrSlug);
    if (!project) throw notFound();
    const membership = await this.deps.members.getRole(project.id, viewer.id);
    if (!canSeeSpace(viewer.role, { isPrivate: project.isPrivate }, membership)) throw notFound();
    return { projectId: project.id, membership };
  }

  /** The caller's membership and what they may do in the space (for the UI; the guards enforce it). */
  async describe(viewer: SpaceViewer, projectId: string): Promise<SpaceCapabilities> {
    return spaceCapabilities(viewer.role, await this.deps.members.getRole(projectId, viewer.id));
  }

  async assertCanMaintain(viewer: SpaceViewer, idOrSlug: string): Promise<string> {
    const { projectId, membership } = await this.assertCanSee(viewer, idOrSlug);
    if (!canMaintainSpace(viewer.role, membership)) {
      throw new SpaceAccessError(
        SPACE_ACCESS_ERROR_CODE.NOT_MAINTAINER,
        "Only this space's maintainers and workspace admins can change its settings.",
      );
    }
    return projectId;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new SpaceAccessError(SPACE_ACCESS_ERROR_CODE.NOT_FOUND, "Space not found");
}
