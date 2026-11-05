import { liveAppInstance, previewInstance, type AppHost } from "@viberglass/types";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import type { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import type { RepositoryHost } from "@viberglass/integration-core";
import { AppSpaceError } from "./AppSpaceError";

type SpaceRepository = { host: Pick<RepositoryHost, "parseRepository" | "archiveRepository">; token: string } | { unavailable: string };

// The reconcilers' limit: a claim older than this died with its process.
const BUSY_STALE_MS = 15 * 60 * 1000;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What deleting an App space removes outside its rows: the app's and its
 * previews' instances, what the host keeps for the space, its secret settings,
 * and the repository, which is archived. Returns what couldn't be done but doesn't stop the deletion.
 */
export class AppSpaceTeardown {
  constructor(
    private readonly apps: Pick<AppDAO, "get" | "claim" | "update" | "finish">,
    private readonly previews: Pick<AppPreviewDAO, "listForProject" | "claim" | "finish">,
    private readonly host: () => AppHost | null,
    private readonly scmConfigs: { getByProjectId(projectId: string): Promise<{ sourceRepository: string } | null> },
    private readonly repositories: { resolve(projectId: string): Promise<SpaceRepository> },
    private readonly settings: Pick<AppSettingDAO, "list">,
    private readonly secrets: { deleteSecret(id: string): Promise<boolean> },
  ) {}

  /** Throws APP_BUSY while the app or a preview is starting or stopping, before anything is removed. */
  async tearDown(projectId: string, now = new Date()): Promise<string[]> {
    const previewIds = await this.claimAll(projectId, new Date(now.getTime() - BUSY_STALE_MS));
    // Claims are left in place: the rows go with the space.
    await this.apps.update(projectId, { power: "off" });
    const host = this.host();
    if (host) {
      for (const id of previewIds) await host.delete(previewInstance(id));
      await host.delete(liveAppInstance(projectId));
      await host.forgetSpace(projectId);
    }
    for (const setting of await this.settings.list(projectId)) {
      if (setting.secretId) await this.secrets.deleteSecret(setting.secretId);
    }
    const warning = await this.archiveRepository(projectId);
    return warning ? [warning] : [];
  }

  private async claimAll(projectId: string, staleBefore: Date): Promise<string[]> {
    const releases: Array<() => Promise<void>> = [];
    try {
      if (await this.apps.get(projectId)) {
        if (!(await this.apps.claim(projectId, staleBefore))) throw busy();
        releases.push(() => this.apps.finish(projectId, {}));
      }
      const ids: string[] = [];
      for (const preview of await this.previews.listForProject(projectId)) {
        if (!(await this.previews.claim(preview.id, staleBefore))) throw busy();
        releases.push(() => this.previews.finish(preview.id, {}));
        ids.push(preview.id);
      }
      return ids;
    } catch (error) {
      await Promise.all(releases.map((release) => release()));
      throw error;
    }
  }

  private async archiveRepository(projectId: string): Promise<string | null> {
    const scmConfig = await this.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) return null;
    const repository = await this.repositories.resolve(projectId);
    if ("unavailable" in repository) return `The repository ${scmConfig.sourceRepository} wasn't archived: ${repository.unavailable}.`;
    const ref = repository.host.parseRepository(scmConfig.sourceRepository);
    if (!ref || !repository.host.archiveRepository) {
      return `The repository ${scmConfig.sourceRepository} wasn't archived: its code host can't archive repositories.`;
    }
    try {
      await repository.host.archiveRepository(ref, repository.token);
      return null;
    } catch (error) {
      return `The repository ${ref.fullName} wasn't archived: ${message(error)}`;
    }
  }
}

function busy(): AppSpaceError {
  return new AppSpaceError("APP_BUSY", "The app or one of its previews is starting or stopping. Try again in a minute.");
}
