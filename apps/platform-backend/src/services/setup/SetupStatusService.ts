import {
  AGENT_LABELS,
  getDefaultAgentBindingForProvider,
  MODEL_PROVIDERS,
  type Clanker,
  type IntegrationCredential,
  type Integration,
  type ModelProviderId,
  type ProjectScmConfig,
  type SetupStatus,
} from "@viberglass/types";
import type { ProjectConfig } from "../../models/PMIntegration";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SecretDAO } from "../../persistence/secret/SecretDAO";
import { DEFAULT_AGENT_SLUG } from "./SetupAgentService";

interface Dependencies {
  secrets: { getSecretByName(name: string): Promise<{ id: string } | null> };
  integrations: { listIntegrations(system: "github"): Promise<Integration[]> };
  credentials: { getDefaultForIntegration(integrationId: string): Promise<IntegrationCredential | null> };
  projects: { listProjects(limit?: number): Promise<ProjectConfig[]> };
  scmConfigs: { getByProjectId(projectId: string): Promise<ProjectScmConfig | null> };
  clankers: {
    getClankerBySlug(slug: string): Promise<Clanker | null>;
    listClankers(limit?: number): Promise<Clanker[]>;
  };
}

const defaults = (): Dependencies => ({
  secrets: new SecretDAO(),
  integrations: new IntegrationDAO(),
  credentials: new IntegrationCredentialDAO(),
  projects: new ProjectDAO(),
  scmConfigs: new ProjectScmConfigDAO(),
  clankers: new ClankerDAO(),
});

/** What setup has already done, so the flow resumes at the first step that's left. */
export class SetupStatusService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getStatus(): Promise<SetupStatus> {
    const [connectedProviders, repositoryConnected, space, defaultAgent, runners] = await Promise.all([
      this.getConnectedProviders(),
      this.isRepositoryConnected(),
      this.findSpace(),
      this.deps.clankers.getClankerBySlug(DEFAULT_AGENT_SLUG),
      this.deps.clankers.listClankers(200),
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
      repositoryConnected,
      space,
      agent,
      complete: space !== null && hasActiveRunner,
    };
  }

  private async getConnectedProviders(): Promise<ModelProviderId[]> {
    const found = await Promise.all(
      MODEL_PROVIDERS.map(async (provider) => {
        const binding = getDefaultAgentBindingForProvider(provider.id);
        const secret = binding ? await this.deps.secrets.getSecretByName(binding.envVar) : null;
        return secret ? provider.id : null;
      }),
    );
    return found.filter((id): id is ModelProviderId => id !== null);
  }

  private async isRepositoryConnected(): Promise<boolean> {
    const github = (await this.deps.integrations.listIntegrations("github")).find((i) => i.isActive);
    return github ? (await this.deps.credentials.getDefaultForIntegration(github.id)) !== null : false;
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
