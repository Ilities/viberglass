import {
  getAgentLabel,
  MODEL_PROVIDERS,
  type Clanker,
  type IntegrationCredential,
  type Integration,
  type ModelProviderId,
  type DemoWorkspace,
  type ModelEndpoint,
  type ProjectScmConfig,
  type AppHomeStatus,
  type SetupStatus,
} from "@viberglass/types";
import type { Project } from "@viberglass/types";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
import { SecretDAO } from "../../persistence/secret/SecretDAO";
import { DEFAULT_AGENT_SLUG } from "./SetupAgentService";
import { findSetupCodeHost, type SetupCodeHost } from "./setupCodeHost";
import { DemoWorkspaceService } from "../demo/DemoWorkspaceService";
import { createAppHomeService } from "../apps/createAppSpaceServices";

interface Dependencies {
  secrets: { getLatestSecretForProvider(provider: ModelProviderId): Promise<{ id: string } | null> };
  integrations: { listIntegrations(system: string): Promise<Integration[]> };
  codeHost: () => SetupCodeHost | null;
  credentials: { getDefaultForIntegration(integrationId: string): Promise<IntegrationCredential | null> };
  projects: { listProjects(limit?: number): Promise<Project[]> };
  scmConfigs: { getByProjectId(projectId: string): Promise<ProjectScmConfig | null> };
  clankers: {
    getClankerBySlug(slug: string): Promise<Clanker | null>;
    listClankers(limit?: number): Promise<Clanker[]>;
  };
  demo: { getDemo(): Promise<DemoWorkspace | null> };
  endpoints: { list(): Promise<ModelEndpoint[]> };
  appHome: { status(): Promise<AppHomeStatus> };
}

const defaults = (): Dependencies => ({
  secrets: new SecretDAO(),
  integrations: new IntegrationDAO(),
  codeHost: findSetupCodeHost,
  credentials: new IntegrationCredentialDAO(),
  projects: new ProjectDAO(),
  scmConfigs: new ProjectScmConfigDAO(),
  clankers: new ClankerDAO(),
  demo: new DemoWorkspaceService(),
  endpoints: new ModelEndpointDAO(),
  appHome: createAppHomeService(),
});

/** What setup has already done, so the flow resumes at the first step that's left. */
export class SetupStatusService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getStatus(): Promise<SetupStatus> {
    const [connectedProviders, endpoints, repositoryConnected, space, defaultAgent, runners, demo, appHome] = await Promise.all([
      this.getConnectedProviders(),
      this.deps.endpoints.list(),
      this.isRepositoryConnected(),
      this.findSpace(),
      this.deps.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG),
      this.deps.clankers.listClankers(200),
      this.deps.demo.getDemo(),
      this.deps.appHome.status(),
    ]);

    const agent = defaultAgent
      ? {
          clankerId: defaultAgent.id,
          agentName: getAgentLabel(defaultAgent.agent),
          status: defaultAgent.status,
          statusMessage: defaultAgent.statusMessage ?? null,
        }
      : null;
    const createsRepositories = this.deps.codeHost()?.repository.creator !== undefined;
    const hasActiveRunner = runners.some((runner) => runner.status === "active");

    return {
      connectedProviders,
      connectedEndpoints: endpoints.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, models: endpoint.models })),
      repositoryConnected,
      createsRepositories,
      appSpaces: appSpacesState(appHome, createsRepositories),
      space,
      agent,
      complete: space !== null && hasActiveRunner,
      demo,
    };
  }

  private async getConnectedProviders(): Promise<ModelProviderId[]> {
    const found = await Promise.all(
      MODEL_PROVIDERS.map(async (provider) => {
        const secret = await this.deps.secrets.getLatestSecretForProvider(provider.id);
        return secret ? provider.id : null;
      }),
    );
    return found.filter((id): id is ModelProviderId => id !== null);
  }

  private async isRepositoryConnected(): Promise<boolean> {
    const codeHost = this.deps.codeHost();
    if (!codeHost) return false;
    const connection = (await this.deps.integrations.listIntegrations(codeHost.system)).find((i) => i.isActive);
    return connection ? (await this.deps.credentials.getDefaultForIntegration(connection.id)) !== null : false;
  }

  /** A space with a repository (Git or App) wins over a Files space, so a workspace that has one still resumes it. */
  private async findSpace(): Promise<SetupStatus["space"]> {
    let filesSpace: SetupStatus["space"] = null;
    for (const project of await this.deps.projects.listProjects(50)) {
      if (project.backingKind === "files") {
        filesSpace ??= { projectId: project.id, name: project.name, slug: project.slug, backingKind: "files", repositoryUrl: null };
        continue;
      }
      const scmConfig = await this.deps.scmConfigs.getByProjectId(project.id);
      if (scmConfig) {
        return {
          projectId: project.id,
          name: project.name,
          slug: project.slug,
          backingKind: project.backingKind === "app" ? "app" : "git",
          repositoryUrl: scmConfig.sourceRepository,
        };
      }
    }
    return filesSpace;
  }
}

/** Setup can save the App home itself, so it offers App spaces when that's all that's missing. */
function appSpacesState(appHome: AppHomeStatus, createsRepositories: boolean): SetupStatus["appSpaces"] {
  if (appHome.availability.available) return "available";
  const onlyHomeMissing = appHome.availability.missing.every((requirement) => requirement === "app_home");
  return onlyHomeMissing && createsRepositories ? "needs_home" : "unavailable";
}
