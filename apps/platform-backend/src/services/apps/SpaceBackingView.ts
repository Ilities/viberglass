import type { Readable } from "node:stream";
import { ejectedAppDataKey, type AppHomeStatus, type EjectedAppData, type SpaceBackingOptions } from "@viberglass/types";
import type { EjectedApp, SpaceBackingDAO } from "../../persistence/apps/SpaceBackingDAO";
import type { ProjectDAO } from "../../persistence/project/ProjectDAO";
import type { SpaceFilesStore } from "../spaceFiles/SpaceFilesStore";
import { APP_NAME_RULE, isAppSpaceSlug } from "./AppOrigins";
import { AppSpaceError } from "./AppSpaceError";

const DAY_MS = 24 * 60 * 60_000;

/** What switching a space between git and App can offer, and the last copy of an ejected app's data. */
export class SpaceBackingView {
  constructor(
    private readonly projects: Pick<ProjectDAO, "getProject">,
    private readonly appHome: { status(): Promise<AppHomeStatus> },
    private readonly backing: Pick<SpaceBackingDAO, "ejected">,
    private readonly store: Pick<SpaceFilesStore, "bucket" | "open">,
    private readonly keepDays: number,
  ) {}

  /** Null when there's no such space. */
  async options(projectId: string): Promise<SpaceBackingOptions | null> {
    const project = await this.projects.getProject(projectId);
    if (!project) return null;
    const { home, availability } = await this.appHome.status();
    const ejected = project.backingKind === "git" ? await this.backing.ejected(projectId) : null;
    return {
      appSpacesAvailable: Boolean(home) && availability.available,
      nameFitsApp: isAppSpaceSlug(project.slug),
      appNameRule: APP_NAME_RULE,
      ejected: ejected ? this.ejectedData(ejected) : null,
      keepDays: this.keepDays,
    };
  }

  async openLastCopy(projectId: string): Promise<{ filename: string; content: Readable }> {
    const project = await this.projects.getProject(projectId);
    const ejected = project?.backingKind === "git" ? await this.backing.ejected(projectId) : null;
    if (!project || !ejected?.backupId || ejected.copyBytes === null) {
      throw new AppSpaceError("NO_LAST_COPY", "There's no copy of this space's app data to download.");
    }
    const content = await this.store.open(`s3://${this.store.bucket()}/${ejectedAppDataKey(projectId, ejected.backupId)}`);
    return { filename: `${project.slug}-app-data.db`, content };
  }

  private ejectedData(ejected: EjectedApp): EjectedAppData {
    return {
      ejectedAt: ejected.ejectedAt.toISOString(),
      bytes: ejected.copyBytes,
      keptUntil: new Date(ejected.ejectedAt.getTime() + this.keepDays * DAY_MS).toISOString(),
    };
  }
}
