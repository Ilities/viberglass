import { RepositoryAccessError, type RepositoryHost, type RepositoryRef } from "@viberglass/integration-core";
import { APP_MANIFEST_FILE, type AppHomeStatus, type AppStartFrom, type Project, type ProjectScmConfig, type SpaceBroughtIn } from "@viberglass/types";
import { slugify, type ProjectDAO } from "../../persistence/project/ProjectDAO";
import type { SpaceBackingDAO } from "../../persistence/apps/SpaceBackingDAO";
import type { AppContractTask } from "./AppContractTask";
import type { AppDataSeed, AppDataSeeder } from "./AppDataSeeder";
import { APP_NAME_RULE, isAppSpaceSlug } from "./AppOrigins";
import { AppSpaceError } from "./AppSpaceError";

type SpaceRepository = { host: Pick<RepositoryHost, "parseRepository" | "checkAccess" | "hasFile">; token: string } | { unavailable: string };

export interface BringInRequest {
  /** A new name for the space, when its own doesn't work as an app's address. */
  name?: string;
  startFrom: AppStartFrom;
  /** The uploaded SQLite file, for `upload`. */
  uploadPath?: string;
}

interface Dependencies {
  projects: Pick<ProjectDAO, "getProject" | "findByName" | "updateProject">;
  appHome: { status(): Promise<AppHomeStatus> };
  scmConfigs: { getByProjectId(projectId: string): Promise<ProjectScmConfig | null> };
  repositories: { resolve(projectId: string): Promise<SpaceRepository> };
  backing: Pick<SpaceBackingDAO, "ejected" | "makeApp">;
  seeder: Pick<AppDataSeeder, "check" | "seed">;
  contractTask: Pick<AppContractTask, "open">;
}

const FIX_CONNECTION = "Fix the token on the space's connection in its settings, under Connections, then try again.";

/**
 * Makes a git space an App space on the repository it already has. Every
 * check runs before anything changes; the app's data is seeded before the
 * backing switches, so its first start finds it.
 */
export class SpaceBringIn {
  constructor(private readonly deps: Dependencies) {}

  /** Null when there's no such space. */
  async bringIn(projectId: string, requesterId: string, request: BringInRequest): Promise<SpaceBroughtIn | null> {
    const project = await this.deps.projects.getProject(projectId);
    if (!project) return null;
    if (project.backingKind !== "git") throw new AppSpaceError("NOT_A_GIT_SPACE", "Only a git space can become an App space.");
    if (project.archivedAt) throw new AppSpaceError("ARCHIVED", "This space is archived, so it can't host an app.");
    const { home, availability } = await this.deps.appHome.status();
    if (!home || !availability.available) {
      throw new AppSpaceError("APP_SPACES_UNAVAILABLE", "This workspace isn't set up for App spaces. Ask an administrator.");
    }
    const rename = await this.newName(project, request.name);
    const repository = await this.repository(projectId);
    const seed = await this.seedFor(projectId, request);
    this.deps.seeder.check(seed);

    if (rename) await this.deps.projects.updateProject(projectId, { name: rename });
    await this.deps.seeder.seed(projectId, seed);
    await this.deps.backing.makeApp(projectId);

    const slug = rename ? slugify(rename) : project.slug;
    if (await this.hasManifest(repository)) return { slug, contractTaskId: null, warnings: [] };
    const task = await this.deps.contractTask.open(projectId, requesterId);
    return { slug, contractTaskId: task.taskId, warnings: task.warning ? [task.warning] : [] };
  }

  private async newName(project: Project, requested: string | undefined): Promise<string | null> {
    const name = requested?.trim();
    if (!name || name === project.name) {
      if (!isAppSpaceSlug(project.slug)) throw new AppSpaceError("SPACE_NAME_INVALID", `Give the space a new name. ${APP_NAME_RULE}`);
      return null;
    }
    const slug = slugify(name);
    if (!isAppSpaceSlug(slug)) throw new AppSpaceError("SPACE_NAME_INVALID", APP_NAME_RULE);
    const existing = await this.deps.projects.findByName(slug);
    if (existing && existing.id !== project.id) {
      throw new AppSpaceError("SPACE_EXISTS", `There's already a space called "${existing.name}". Choose another name.`);
    }
    return name;
  }

  private async repository(projectId: string): Promise<{ host: Pick<RepositoryHost, "hasFile">; token: string; ref: RepositoryRef; branch: string }> {
    const scmConfig = await this.deps.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) throw new AppSpaceError("REPOSITORY_UNAVAILABLE", "This space has no repository to host an app from.");
    if (scmConfig.pullRequestRepository || (scmConfig.pullRequestBaseBranch && scmConfig.pullRequestBaseBranch !== scmConfig.baseBranch)) {
      throw new AppSpaceError(
        "REPOSITORY_UNAVAILABLE",
        "This space opens pull requests against another repository or branch. An app's changes go live from its own branch, so clear those in the space's Repository settings, under Advanced.",
      );
    }
    const resolved = await this.deps.repositories.resolve(projectId);
    if ("unavailable" in resolved) throw new AppSpaceError("REPOSITORY_UNAVAILABLE", `${resolved.unavailable}.`);
    const ref = resolved.host.parseRepository(scmConfig.sourceRepository);
    if (!ref) throw new AppSpaceError("REPOSITORY_UNAVAILABLE", `${scmConfig.sourceRepository} isn't a repository its code host knows.`);
    try {
      // Merging needs the same write access an agent's push does.
      await resolved.host.checkAccess(ref, resolved.token);
    } catch (error) {
      if (!(error instanceof RepositoryAccessError)) throw error;
      throw new AppSpaceError("CANT_MERGE", `Viberglass couldn't merge changes into ${ref.fullName}: ${error.message} ${FIX_CONNECTION}`);
    }
    return { host: resolved.host, token: resolved.token, ref, branch: scmConfig.baseBranch };
  }

  private async seedFor(projectId: string, request: BringInRequest): Promise<AppDataSeed> {
    if (request.startFrom === "upload") {
      if (!request.uploadPath) throw new AppSpaceError("DATA_FILE_INVALID", "Choose the SQLite file the app should start with.");
      return { from: "upload", path: request.uploadPath };
    }
    if (request.startFrom === "none") return { from: "none" };
    const ejected = await this.deps.backing.ejected(projectId);
    if (!ejected?.backupId) throw new AppSpaceError("NO_LAST_COPY", "There's no copy of this space's app data to start from.");
    return { from: "last_copy", backupId: ejected.backupId };
  }

  /** Without a way to look, the agent is asked and finds the manifest itself. */
  private async hasManifest(repository: { host: Pick<RepositoryHost, "hasFile">; token: string; ref: RepositoryRef; branch: string }): Promise<boolean> {
    if (!repository.host.hasFile) return false;
    return repository.host.hasFile(repository.ref, APP_MANIFEST_FILE, repository.branch, repository.token).catch(() => false);
  }
}
