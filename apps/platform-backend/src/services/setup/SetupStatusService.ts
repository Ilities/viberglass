import {
  AGENT_LABELS,
  MODEL_PROVIDERS,
  type Clanker,
  type IntegrationCredential,
  type Integration,
  type ModelProviderId,
  type DemoWorkspace,
  type ModelEndpoint,
  type ProjectScmConfig,
  type SetupStatus,
} from "@viberglass/types";
import type { ProjectConfig } from "../../models/PMIntegration";
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

interface Dependencies {
  secrets: { getLatestSecretForProvider(provider: ModelProviderId): Promise<{ id: string } | null> };
  integrations: { listIntegrations(system: string): Promise<Integration[]> };
  codeHost: () => SetupCodeHost | null;
  credentials: { getDefaultForIntegration(integrationId: string): Promise<IntegrationCredential | null> };
  projects: { listProjects(limit?: number): Promise<ProjectConfig[]> };
  scmConfigs: { getByProjectId(projectId: string): Promise<ProjectScmConfig | null> };
  clankers: {
    getClankerBySlug(slug: string): Promise<Clanker | null>;
    listClankers(limit?: number): Promise<Clanker[]>;
  };
  demo: { getDemo(): Promise<DemoWorkspace | null> };
  endpoints: { list(): Promise<ModelEndpoint[]> };
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
});

/** What setup has already done, so the flow resumes at the first step that's left. */
export class SetupStatusService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getStatus(): Promise<SetupStatus> {
    const [connectedProviders, endpoints, repositoryConnected, space, defaultAgent, runners, demo] = await Promise.all([
      this.getConnectedProviders(),
      this.deps.endpoints.list(),
      this.isRepositoryConnected(),
      this.findSpace(),
      this.deps.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG),
      this.deps.clankers.listClankers(200),
      this.deps.demo.getDemo(),
    ]);

    const agent = defaultAgent
      ? {
          clankerId: defaultAgent.id,
          agentName: AGENT_LABELS[defaultAgent.agent ?? "claude-code"],
          status: defaultAgent.status,
          statusMessage: defaultAgent.statusMessage ?? null,
        }
      : null;
    const hasActiveRunner = runners.some((runner) => runner.status === "active");

    return {
      connectedProviders,
      connectedEndpoints: endpoints.map((endpoint) => ({ id: endpoint.id, name: endpoint.name, models: endpoint.models })),
      repositoryConnected,
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

  private async findSpace(): Promise<SetupStatus["space"]> {
    for (const project of await this.deps.projects.listProjects(50)) {
      const scmConfig = await this.deps.scmConfigs.getByProjectId(project.id);
      if (scmConfig) {
        return {
          projectId: project.id,
          name: project.name,
          slug: project.slug,
          repositoryUrl: scmConfig.sourceRepository,
        };
      }
    }
    return null;
  }
}
