import { APP_MANIFEST_FILE } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSpaceDAO } from "../../persistence/apps/AppSpaceDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { ProjectRepositoryResolver } from "../repositories/ProjectRepositoryResolver";
import { AppBuilderUnavailable } from "./AppBuilderRunner";
import type { ReleaseBuildService } from "./ReleaseBuildService";

const logger = createChildLogger({ service: "AppReleasePoller" });

// Longer than starting a build takes, so a build being started isn't failed.
const UNDISPATCHED_GRACE_MS = 10 * 60 * 1000;

/**
 * Builds a release whenever an App space's default branch moves, however it
 * moved: a change made live here or a merge made on the code host.
 */
export class AppReleasePoller {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "listLiveIds">,
    private readonly scmConfigs: Pick<ProjectScmConfigDAO, "getByProjectId">,
    private readonly repositories: Pick<ProjectRepositoryResolver, "resolve">,
    private readonly releases: Pick<AppReleaseDAO, "hasCommit" | "failAbandoned">,
    private readonly builds: Pick<ReleaseBuildService, "build">,
  ) {}

  /** Returns how many builds it started or gave up on. */
  async sweep(now: Date): Promise<number> {
    let acted = await this.releases.failAbandoned(new Date(now.getTime() - UNDISPATCHED_GRACE_MS));
    for (const projectId of await this.spaces.listLiveIds()) {
      try {
        if (await this.buildHead(projectId)) acted++;
      } catch (error) {
        if (error instanceof AppBuilderUnavailable) {
          logger.info("Release builds wait for the app builder", { reason: error.message });
          break;
        }
        logger.warn("Could not check an App space's branch for a new release", {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return acted;
  }

  private async buildHead(projectId: string): Promise<boolean> {
    const scmConfig = await this.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) return false;
    const repository = await this.repositories.resolve(projectId);
    if ("unavailable" in repository) throw new Error(repository.unavailable);
    const ref = repository.host.parseRepository(scmConfig.sourceRepository);
    if (!ref) throw new Error(`Not a repository on its code host: ${scmConfig.sourceRepository}`);

    const head = await repository.host.fetchBranchHead(ref, scmConfig.baseBranch, repository.token);
    if (!head || (await this.releases.hasCommit(projectId, head))) return false;
    // A new repository's first commit, or one brought in before it follows the app contract, has nothing to build.
    if (repository.host.hasFile && !(await repository.host.hasFile(ref, APP_MANIFEST_FILE, head, repository.token))) return false;
    const release = await this.builds.build(scmConfig, head);
    if (release) logger.info("Started a release build", { projectId, releaseId: release.id, commitSha: head });
    return release !== null;
  }
}
