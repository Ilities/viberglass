import type { Project } from "@viberglass/types";
import type { AppSpaceTeardown } from "../apps/AppSpaceTeardown";
import { spaceObjectsPrefix, type SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";

export interface SpaceDeletion {
  /** What couldn't be done; the space is gone anyway. */
  warnings: string[];
}

/**
 * Deletes a space with what it has outside the database. Everything that would
 * be left running or stored without a row to find it by goes first, so a
 * failure there leaves the space in place to delete again.
 */
export class SpaceDeletionService {
  constructor(
    private readonly projects: {
      getProject(projectId: string): Promise<Pick<Project, "backingKind" | "name"> | null>;
      deleteProject(projectId: string): Promise<void>;
    },
    private readonly apps: Pick<AppSpaceTeardown, "tearDown">,
    private readonly storage: Pick<SpaceFilesStore, "delete">,
    private readonly bucket: () => string,
  ) {}

  /** Null when there's no such space. */
  async delete(projectId: string): Promise<SpaceDeletion | null> {
    const project = await this.projects.getProject(projectId);
    if (!project) return null;
    const warnings = project.backingKind === "app" ? await this.apps.tearDown(projectId, project.name) : [];
    const bucket = this.bucket();
    if (bucket) await this.storage.delete(spaceObjectsPrefix(bucket, projectId));
    await this.projects.deleteProject(projectId);
    return { warnings };
  }
}
