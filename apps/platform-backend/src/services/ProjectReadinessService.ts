import type { Clanker, ProjectReadiness, ProjectReadinessCheck } from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { SecretDAO } from "../persistence/secret/SecretDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { agentCredentialsCheck, agentRunnerCheck } from "./readiness/agentReadinessChecks";
import { DemoWorkspaceService } from "./demo/DemoWorkspaceService";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";

/** How long before a credential expires that it's flagged. */
export const EXPIRY_WARNING_MS = 7 * 24 * 3_600_000;

export class ProjectReadinessService {
  constructor(
    private readonly projectDAO = new ProjectDAO(),
    private readonly scmConfigDAO = new ProjectScmConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly clankerDAO = new ClankerDAO(),
    private readonly secretDAO: Pick<SecretDAO, "getSecret"> = new SecretDAO(),
    private readonly demo: Pick<DemoWorkspaceService, "getDemo"> = new DemoWorkspaceService(),
    private readonly tickets: Pick<TicketDAO, "projectHasRuns"> = new TicketDAO(),
  ) {}

  async getReadiness(projectId: string): Promise<ProjectReadiness | null> {
    const project = await this.projectDAO.getProject(projectId);
    if (!project) return null;

    // The demo space is sample data: nothing to set up, and nothing runs there.
    if ((await this.demo.getDemo())?.projectId === projectId) {
      return {
        projectId,
        automationAvailable: false,
        hasRuns: true,
        checks: [
          {
            key: "demo",
            label: "Demo space",
            state: "unavailable",
            summary: "Sample data only: tasks here don't run. Set up your own space to try an agent.",
            remediationUrl: "/setup",
          },
        ],
      };
    }

    const [scmConfig, runners] = await Promise.all([
      this.scmConfigDAO.getByProjectId(projectId),
      this.clankerDAO.listClankers(),
    ]);

    // In the order setup asks for them: model key, repository, its token, a running agent.
    const existingSecretIds = await this.findExistingSecretIds(runners);
    const checks: ProjectReadinessCheck[] = [
      agentCredentialsCheck(runners, existingSecretIds),
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
            remediationUrl: `/spaces/${project.slug}/settings/repository`,
          },
      await this.getScmCredentialCheck(project.slug, scmConfig),
      agentRunnerCheck(runners, existingSecretIds),
    ];

    return {
      projectId,
      automationAvailable: checks.every((check) => check.state === "ready"),
      hasRuns: await this.tickets.projectHasRuns(projectId),
      checks,
    };
  }

  private async findExistingSecretIds(runners: Clanker[]): Promise<Set<string>> {
    const ids = [...new Set(runners.flatMap((runner) => runner.secretBindings.map((binding) => binding.secretId)))];
    const found = await Promise.all(ids.map((id) => this.secretDAO.getSecret(id)));
    return new Set(found.flatMap((secret) => (secret ? [secret.id] : [])));
  }

  private async getScmCredentialCheck(
    projectSlug: string,
    scmConfig: Awaited<ReturnType<ProjectScmConfigDAO["getByProjectId"]>>,
  ): Promise<ProjectReadinessCheck> {
    const remediationUrl = `/spaces/${projectSlug}/settings/repository`;
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

    // Warned a week ahead, so it's replaced before runs start failing on it.
    const expiresSoon = expiresAt !== null && expiresAt.getTime() - Date.now() <= EXPIRY_WARNING_MS;
    return {
      key: "scmCredential",
      label: "SCM credential",
      state: "ready",
      summary: "The selected SCM credential is available.",
      ...(expiresSoon && expiresAt
        ? {
            warning: `The SCM credential expires on ${expiresAt.toISOString().slice(0, 10)}. Replace it before then, or runs will stop.`,
            remediationUrl,
          }
        : {}),
    };
  }
}
