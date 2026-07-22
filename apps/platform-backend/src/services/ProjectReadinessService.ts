import type { ProjectReadiness, ProjectReadinessCheck } from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";

export class ProjectReadinessService {
  constructor(
    private readonly projectDAO = new ProjectDAO(),
    private readonly scmConfigDAO = new ProjectScmConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly clankerDAO = new ClankerDAO(),
  ) {}

  async getReadiness(projectId: string): Promise<ProjectReadiness | null> {
    const project = await this.projectDAO.getProject(projectId);
    if (!project) return null;

    const [scmConfig, runners] = await Promise.all([
      this.scmConfigDAO.getByProjectId(projectId),
      this.clankerDAO.listClankers(),
    ]);
    const activeRunners = runners.filter(
      (runner) => runner.status === "active" && Boolean(runner.deploymentStrategyId),
    );

    const checks: ProjectReadinessCheck[] = [
      scmConfig?.sourceRepository.trim()
        ? {
            key: "repository",
            label: "Repository",
            state: "ready",
            summary: "A source repository is configured.",
          }
        : {
            key: "repository",
            label: "Repository",
            state: "missing",
            code: "configure_repository",
            summary: "Choose the codebase this project should automate.",
            remediationUrl: `/project/${project.slug}/settings`,
          },
      await this.getScmCredentialCheck(project.slug, scmConfig),
      activeRunners.length > 0
        ? {
            key: "agentRunner",
            label: "Agent runner",
            state: "ready",
            summary: `${activeRunners.length} agent runner${activeRunners.length === 1 ? " is" : "s are"} available.`,
          }
        : {
            key: "agentRunner",
            label: "Agent runner",
            state: runners.length > 0 ? "unavailable" : "missing",
            code: "start_agent_runner",
            summary:
              runners.length > 0
                ? "Configured agent runners are currently unavailable."
                : "Configure an agent runner to perform automation.",
            remediationUrl: "/clankers",
          },
      activeRunners.some((runner) => runner.secretIds.length > 0)
        ? {
            key: "agentCredentials",
            label: "Agent credentials",
            state: "ready",
            summary: "An available agent runner has credentials configured.",
          }
        : {
            key: "agentCredentials",
            label: "Agent credentials",
            state: "missing",
            code: "configure_agent_credentials",
            summary: "Add model credentials to an agent runner before starting work.",
            remediationUrl: "/clankers",
          },
    ];

    return {
      projectId,
      automationAvailable: checks.every((check) => check.state === "ready"),
      checks,
    };
  }

  private async getScmCredentialCheck(
    projectSlug: string,
    scmConfig: Awaited<ReturnType<ProjectScmConfigDAO["getByProjectId"]>>,
  ): Promise<ProjectReadinessCheck> {
    const remediationUrl = `/project/${projectSlug}/settings`;
    if (!scmConfig?.integrationCredentialId) {
      return {
        key: "scmCredential",
        label: "SCM credential",
        state: "missing",
        code: "select_scm_credential",
        summary: "Select a credential that can read the repository and create pull requests.",
        remediationUrl,
      };
    }

    const credential = await this.credentialDAO.getById(
      scmConfig.integrationCredentialId,
    );
    const expiresAt = credential?.expiresAt
      ? new Date(credential.expiresAt)
      : null;
    if (
      !credential ||
      credential.integrationId !== scmConfig.integrationId ||
      (expiresAt !== null && expiresAt.getTime() <= Date.now())
    ) {
      return {
        key: "scmCredential",
        label: "SCM credential",
        state: "invalid",
        code: "replace_expired_scm_credential",
        summary: credential ? "The selected SCM credential has expired." : "The selected SCM credential is no longer available.",
        remediationUrl,
      };
    }

    return {
      key: "scmCredential",
      label: "SCM credential",
      state: "ready",
      summary: "The selected SCM credential is available.",
    };
  }
}
