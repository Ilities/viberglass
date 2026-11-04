import { liveAppInstance, PREVIEW_ADDRESS_PREFIX, previewInstance, type WorkspaceRole } from "@viberglass/types";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppPreviewDAO, PreviewAddressRef } from "../../persistence/apps/AppPreviewDAO";
import type { AppSpaceDAO, AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";
import type { AppAccess } from "./AppAccess";

/** What an address under the apps domain serves: an App space's live app, or one of its previews. */
export type AppTarget =
  | { kind: "app"; label: string; projectId: string; previewId: null; space: AppSpaceRef }
  | { kind: "preview"; label: string; projectId: string; previewId: string; preview: PreviewAddressRef };

/** Why a target can't be opened now. */
export type AppTargetClosed =
  | { kind: "off"; appName: string; maintainers: string[] }
  | { kind: "preview_off"; taskKey: string; taskPath: string };

/** Finds what an address serves, who may open it, and whether it's running. */
export class AppTargets {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findBySlug">,
    private readonly previews: Pick<AppPreviewDAO, "findByAddress">,
    private readonly apps: Pick<AppDAO, "get">,
    private readonly access: Pick<AppAccess, "canOpen" | "canSeeSpace" | "maintainerNames">,
  ) {}

  async find(label: string): Promise<AppTarget | null> {
    if (label.startsWith(PREVIEW_ADDRESS_PREFIX)) {
      const preview = await this.previews.findByAddress(label);
      return preview ? { kind: "preview", label, projectId: preview.projectId, previewId: preview.previewId, preview } : null;
    }
    const space = await this.spaces.findBySlug(label);
    return space ? { kind: "app", label, projectId: space.projectId, previewId: null, space } : null;
  }

  canOpen(user: { id: string; role: WorkspaceRole }, target: AppTarget): Promise<boolean> {
    return target.kind === "app"
      ? this.access.canOpen(user, target.space)
      : this.access.canSeeSpace(user, { projectId: target.projectId, isPrivate: target.preview.isPrivate });
  }

  /** Null while it's running. A preview's state is as it was when `find` read it. */
  async closed(target: AppTarget): Promise<AppTargetClosed | null> {
    if (target.kind === "preview") {
      if (target.preview.state === "running") return null;
      return {
        kind: "preview_off",
        taskKey: target.preview.taskKey,
        taskPath: `/spaces/${target.preview.projectSlug}/tasks/${target.preview.ticketId}`,
      };
    }
    if ((await this.apps.get(target.projectId))?.state === "running") return null;
    return { kind: "off", appName: target.space.name, maintainers: await this.access.maintainerNames(target.projectId) };
  }

  instance(target: AppTarget): string {
    return target.kind === "app" ? liveAppInstance(target.projectId) : previewInstance(target.previewId);
  }
}
