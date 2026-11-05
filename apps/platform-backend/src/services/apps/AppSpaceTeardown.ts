import { liveAppInstance, previewInstance, type AppHost } from "@viberglass/types";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import type { RepositoryHost } from "@viberglass/integration-core";
import type { AppClaims } from "./AppClaims";

type SpaceRepository = { host: Pick<RepositoryHost, "parseRepository" | "archiveRepository">; token: string } | { unavailable: string };

/** What the archived repository's description says, for whoever finds it later. */
export function archiveNote(spaceName: string, at: Date): string {
  return `Archived by Viberglass on ${at.toISOString().slice(0, 10)}, when the space "${spaceName}" that hosted this app was deleted. Unarchive it in the repository's settings to use it again.`;
}

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
    private readonly apps: Pick<AppDAO, "update">,
    private readonly claims: Pick<AppClaims, "claimAll">,
    private readonly host: () => AppHost | null,
    private readonly scmConfigs: { getByProjectId(projectId: string): Promise<{ sourceRepository: string } | null> },
    private readonly repositories: { resolve(projectId: string): Promise<SpaceRepository> },
    private readonly settings: Pick<AppSettingDAO, "list">,
    private readonly secrets: { deleteSecret(id: string): Promise<boolean> },
  ) {}

  /** Throws APP_BUSY while the app or a preview is starting or stopping, before anything is removed. */
  async tearDown(projectId: string, spaceName: string, now = new Date()): Promise<string[]> {
    const { previewIds } = await this.claims.claimAll(projectId, now);
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
    const warning = await this.archiveRepository(projectId, archiveNote(spaceName, now));
    return warning ? [warning] : [];
  }

  private async archiveRepository(projectId: string, note: string): Promise<string | null> {
    const scmConfig = await this.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) return null;
    const repository = await this.repositories.resolve(projectId);
    if ("unavailable" in repository) return `The repository ${scmConfig.sourceRepository} wasn't archived: ${repository.unavailable}.`;
    const ref = repository.host.parseRepository(scmConfig.sourceRepository);
    if (!ref || !repository.host.archiveRepository) {
      return `The repository ${scmConfig.sourceRepository} wasn't archived: its code host can't archive repositories.`;
    }
    try {
      await repository.host.archiveRepository(ref, repository.token, note);
      return null;
    } catch (error) {
      return `The repository ${ref.fullName} wasn't archived: ${message(error)}`;
    }
  }
}
