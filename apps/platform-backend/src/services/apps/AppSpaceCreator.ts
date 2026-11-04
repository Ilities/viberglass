import { NATIVE_TICKET_ORIGIN, type AppHomeStatus, type Project, type RepositoryAccess } from "@viberglass/types";
import logger from "../../config/logger";
import { slugify, type ProjectDAO } from "../../persistence/project/ProjectDAO";
import type { ProjectIntegrationLinkDAO } from "../../persistence/integrations/ProjectIntegrationLinkDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { ConnectionRepositoryCreator } from "../repositories/ConnectionRepositoryCreator";
import { RepositoryCreationError, type RepositoryCreationErrorCode } from "../repositories/RepositoryCreationError";
import { APP_NAME_RULE, isAppSpaceSlug } from "./AppOrigins";
import { AppSpaceError } from "./AppSpaceError";

/** Whoever creates an App space can't choose the connection or token, so these are for an admin to fix. */
const APP_HOME_PROBLEMS = new Set<RepositoryCreationErrorCode>(["CONNECTION_NOT_FOUND", "CREATION_UNSUPPORTED", "NO_TOKEN", "TOKEN_REJECTED", "CREATE_FORBIDDEN"]);

function forPersonCreating(error: unknown): unknown {
  if (!(error instanceof RepositoryCreationError) || !APP_HOME_PROBLEMS.has(error.code)) return error;
  return new AppSpaceError(
    "APP_HOME_BROKEN",
    `Couldn't create the app's repository: ${error.message} Ask an administrator to check the App home in Settings, under Apps.`,
  );
}

interface Dependencies {
  appHome: { status(): Promise<AppHomeStatus> };
  projects: Pick<ProjectDAO, "findByName" | "createProject" | "deleteProject">;
  links: Pick<ProjectIntegrationLinkDAO, "linkIntegration">;
  scmConfigs: Pick<ProjectScmConfigDAO, "upsertByProjectId">;
  creator: Pick<ConnectionRepositoryCreator, "create">;
}

export interface CreatedAppSpace {
  project: Project;
  repository: RepositoryAccess;
}

/**
 * Creates an App space and its repository in the App home, named after the
 * space. If any step fails the space is removed again, so the name can be
 * reused; a repository created before the failure stays on the code host.
 */
export class AppSpaceCreator {
  constructor(private readonly deps: Dependencies) {}

  async create(name: string, createdBy?: string): Promise<CreatedAppSpace> {
    const { home, availability } = await this.deps.appHome.status();
    if (!home || !availability.available) {
      throw new AppSpaceError("APP_SPACES_UNAVAILABLE", "This workspace isn't set up for App spaces. Ask an administrator.");
    }
    const trimmed = name.trim();
    const slug = slugify(trimmed);
    if (!slug) throw new AppSpaceError("SPACE_NAME_INVALID", "Give the space a name with at least one letter or number.");
    if (!isAppSpaceSlug(slug)) {
      throw new AppSpaceError("SPACE_NAME_INVALID", APP_NAME_RULE);
    }
    const existing = await this.deps.projects.findByName(slug);
    if (existing) {
      throw new AppSpaceError(
        "SPACE_EXISTS",
        `There's already a space called "${existing.name}"${existing.archivedAt ? " (archived)" : ""}. Choose another name.`,
      );
    }

    const project = await this.deps.projects.createProject({
      name: trimmed,
      backingKind: "app",
      primaryScmIntegrationId: home.integrationId,
      ticketSystem: NATIVE_TICKET_ORIGIN,
      credentials: { type: "token" },
      autoFixEnabled: false,
      autoFixTags: [],
      customFieldMappings: {},
    }, createdBy);
    try {
      const repository = await this.deps.creator.create(home.integrationId, home.credentialId, { owner: home.owner, name: slug });
      await this.deps.links.linkIntegration({ projectId: project.id, integrationId: home.integrationId, isPrimary: true });
      await this.deps.scmConfigs.upsertByProjectId(project.id, {
        integrationId: home.integrationId,
        sourceRepository: repository.url,
        baseBranch: repository.defaultBranch,
        integrationCredentialId: home.credentialId,
      });
      return { project, repository };
    } catch (error) {
      await this.deps.projects.deleteProject(project.id).catch((cleanupError: unknown) => {
        logger.error("Failed to remove an App space after its setup failed", {
          projectId: project.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      throw forPersonCreating(error);
    }
  }
}
