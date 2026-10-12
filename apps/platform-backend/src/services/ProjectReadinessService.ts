import type { Clanker, ProjectReadiness, ProjectReadinessCheck } from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { SecretDAO } from "../persistence/secret/SecretDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { agentCredentialsCheck, agentRunnerCheck } from "./readiness/agentReadinessChecks";
import { DemoWorkspaceService } from "./demo/DemoWorkspaceService";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";

export { EXPIRY_WARNING_MS } from "./readiness/scmCredentialCheck";

import { filesSpaceReadiness } from "./readiness/filesSpaceReadiness";
import { scmCredentialCheck } from "./readiness/scmCredentialCheck";

export class ProjectReadinessService {
  constructor(
    private readonly projectDAO = new ProjectDAO(),
    private readonly scmConfigDAO = new ProjectScmConfigDAO(),
    private readonly credentialDAO = new IntegrationCredentialDAO(),
    private readonly clankerDAO = new ClankerDAO(),
    private readonly secretDAO: Pick<SecretDAO, "getSecret"> = new SecretDAO(),
    private readonly demo: Pick<DemoWorkspaceService, "getDemo"> = new DemoWorkspaceService(),
    private readonly tickets: Pick<TicketDAO, "projectHasRuns"> = new TicketDAO(),
    private readonly storageEnvironment: () => Record<string, string | undefined> = () => process.env,
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
      project.backingKind === "files" ? Promise.resolve(null) : this.scmConfigDAO.getByProjectId(projectId),
      this.clankerDAO.listClankers(),
    ]);

    // In the order setup asks for them: model key, repository, its token, a running agent.
    const existingSecretIds = await this.findExistingSecretIds(runners);
    const backingChecks: ProjectReadinessCheck[] = project.backingKind === "files" ? filesSpaceReadiness(this.storageEnvironment()) : [
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
      await scmCredentialCheck(project.slug, scmConfig, this.credentialDAO),
    ];
    const checks: ProjectReadinessCheck[] = [
      agentCredentialsCheck(runners, existingSecretIds),
      ...backingChecks,
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

}
