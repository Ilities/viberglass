import type { NewProject } from "../../persistence/project/ProjectDAO";
import { NATIVE_TICKET_ORIGIN } from "@viberglass/types";
import type {
  CreatedSpace,
  Integration,
  IntegrationCredential,
  ProjectScmConfig,
  UpsertProjectScmConfigRequest,
} from "@viberglass/types";
import type { ProjectConfig } from "../../models/PMIntegration";
import { ProjectDAO, slugify } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import {
  ProjectIntegrationLinkDAO,
  type CreateProjectIntegrationLinkInput,
} from "../../persistence/integrations/ProjectIntegrationLinkDAO";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import { findSetupCodeHost, requireSetupCodeHost, type SetupCodeHost } from "./setupCodeHost";

export interface CreateSpaceInput {
  name: string;
  /** From the repository step. */
  repository: string;
  baseBranch?: string;
}


interface Projects {
  findByName(slug: string): Promise<ProjectConfig | null>;
  createProject(request: NewProject, maintainerId?: string): Promise<ProjectConfig>;
}

interface ScmConfigs {
  getByProjectId(projectId: string): Promise<ProjectScmConfig | null>;
  upsertByProjectId(projectId: string, input: UpsertProjectScmConfigRequest): Promise<ProjectScmConfig>;
}

interface Links {
  isLinked(projectId: string, integrationId: string): Promise<boolean>;
  linkIntegration(input: CreateProjectIntegrationLinkInput): Promise<unknown>;
}

interface CodeHostConnections {
  listIntegrations(system: string): Promise<Integration[]>;
}

interface Credentials {
  getDefaultForIntegration(integrationId: string): Promise<IntegrationCredential | null>;
}

/**
 * The repository's address: the URL the repository step returned (the host's
 * own address for it, so self-hosted servers work), or a name the host reads.
 */
function toRepositoryUrl(input: string, codeHost: SetupCodeHost): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return codeHost.repository.parseRepository(trimmed)?.url ?? null;
}

function sameRepository(a: string, b: string): boolean {
  const normalize = (url: string) => url.trim().toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
  return normalize(a) === normalize(b);
}

/**
 * Setup step "Name your first space": creates the project on the repository
 * connected in the previous step, with everything else defaulted. Running it
 * again with the same name finishes that space instead of adding another,
 * but never repoints a space that already uses a different repository.
 */
export class SetupSpaceService {
  constructor(
    private readonly projects: Projects = new ProjectDAO(),
    private readonly scmConfigs: ScmConfigs = new ProjectScmConfigDAO(),
    private readonly links: Links = new ProjectIntegrationLinkDAO(),
    private readonly integrations: CodeHostConnections = new IntegrationDAO(),
    private readonly credentials: Credentials = new IntegrationCredentialDAO(),
    private readonly codeHost: () => SetupCodeHost | null = findSetupCodeHost,
  ) {}

  /** `createdBy` becomes the new space's first maintainer. */
  async createSpace(input: CreateSpaceInput, createdBy?: string): Promise<CreatedSpace> {
    const name = input.name.trim();
    const slug = slugify(name);
    if (!slug) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.SPACE_NAME_INVALID,
        "Give the space a name with at least one letter or number.",
      );
    }
    const codeHost = requireSetupCodeHost(this.codeHost);
    const repositoryUrl = toRepositoryUrl(input.repository, codeHost);
    if (!repositoryUrl) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_INVALID,
        `Enter the repository as owner/name or its ${codeHost.label} address, for example acme/web.`,
      );
    }
    const { integration, credential } = await this.getConnection(codeHost);

    const project = await this.findOrCreateProject(name, slug, repositoryUrl, createdBy);
    if (!(await this.links.isLinked(project.id, integration.id))) {
      await this.links.linkIntegration({ projectId: project.id, integrationId: integration.id, isPrimary: true });
    }
    const baseBranch = input.baseBranch?.trim() || "main";
    await this.scmConfigs.upsertByProjectId(project.id, {
      integrationId: integration.id,
      sourceRepository: repositoryUrl,
      baseBranch,
      integrationCredentialId: credential.id,
    });

    return { projectId: project.id, name: project.name, slug: project.slug, repositoryUrl, baseBranch };
  }

  private async getConnection(codeHost: SetupCodeHost): Promise<{ integration: Integration; credential: IntegrationCredential }> {
    const integration = (await this.integrations.listIntegrations(codeHost.system)).find((i) => i.isActive);
    const credential = integration ? await this.credentials.getDefaultForIntegration(integration.id) : null;
    if (!integration || !credential) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_NOT_CONNECTED,
        "Connect the repository first, so the space has a token to work with.",
      );
    }
    return { integration, credential };
  }

  private async findOrCreateProject(
    name: string,
    slug: string,
    repositoryUrl: string,
    createdBy: string | undefined,
  ): Promise<ProjectConfig> {
    const existing = await this.projects.findByName(slug);
    if (!existing) {
      return this.projects.createProject({
        name,
        ticketSystem: NATIVE_TICKET_ORIGIN,
        credentials: { type: "token" },
        autoFixEnabled: false,
        autoFixTags: [],
        customFieldMappings: {},
      }, createdBy);
    }

    const scmConfig = await this.scmConfigs.getByProjectId(existing.id);
    if (existing.archivedAt || (scmConfig && !sameRepository(repositoryUrl, scmConfig.sourceRepository))) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS,
        `There's already a space called "${existing.name}"${existing.archivedAt ? " (archived)" : ""}. Choose another name.`,
      );
    }
    return existing;
  }
}
