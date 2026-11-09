import type { Project } from "@viberglass/types";
import type { SpaceDeletionDAO } from "../../persistence/project/SpaceDeletionDAO";
import type { AppSpaceTeardown } from "../apps/AppSpaceTeardown";
import type { JobCancellationService } from "../job/JobCancellationService";
import type { SpaceStoragePurge } from "./SpaceStoragePurge";

export interface SpaceDeletion {
  /** What couldn't be done; the space is gone anyway. */
  warnings: string[];
}

/**
 * Deletes a space with its runs and what it has outside the database.
 * Everything that would be left running or stored without a row to find it by
 * goes first, so a failure there leaves the space in place to delete again.
 */
export class SpaceDeletionService {
  constructor(
    private readonly projects: { getProject(projectId: string): Promise<Pick<Project, "backingKind" | "name"> | null> },
    private readonly apps: Pick<AppSpaceTeardown, "tearDown">,
    private readonly spaces: Pick<SpaceDeletionDAO, "holdings" | "delete">,
    private readonly runs: Pick<JobCancellationService, "stopJob">,
    private readonly storage: Pick<SpaceStoragePurge, "purge">,
  ) {}

  /** Null when there's no such space. */
  async delete(projectId: string): Promise<SpaceDeletion | null> {
    const project = await this.projects.getProject(projectId);
    if (!project) return null;
    const warnings = project.backingKind === "app" ? await this.apps.tearDown(projectId, project.name) : [];
    const holdings = await this.spaces.holdings(projectId);
    for (const runId of holdings.activeRunIds) await this.runs.stopJob(runId);
    await this.storage.purge(projectId, holdings);
    await this.spaces.delete(projectId, holdings.media.map((media) => media.id));
    return { warnings };
  }
}
