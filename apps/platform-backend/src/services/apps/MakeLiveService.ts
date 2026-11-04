import { PullRequestMergeError, RepositoryAccessError } from "@viberglass/integration-core";
import { createChildLogger } from "../../config/logger";
import type { AppPreviewDAO } from "../../persistence/apps/AppPreviewDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import type { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { UserDAO } from "../../persistence/user/UserDAO";
import type { AuditRecorder } from "../audit/AuditRecorder";
import type { PullRequestOutcomeChecker } from "../pull-request-outcomes/PullRequestOutcomeChecker";
import type { ProjectRepositoryResolver } from "../repositories/ProjectRepositoryResolver";
import type { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { AppChangeError } from "./AppChangeError";
import type { ReleaseBuildService } from "./ReleaseBuildService";

const logger = createChildLogger({ service: "MakeLiveService" });

export interface MakeLiveDependencies {
  policy: Pick<TaskAskPolicyService, "describe">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  tickets: Pick<TicketDAO, "getSummary">;
  pullRequests: Pick<TaskPullRequestDAO, "listForTask">;
  previews: Pick<AppPreviewDAO, "findForChange">;
  repositories: Pick<ProjectRepositoryResolver, "resolve">;
  users: Pick<UserDAO, "findById">;
  outcomes: Pick<PullRequestOutcomeChecker, "check">;
  scmConfigs: Pick<ProjectScmConfigDAO, "getByProjectId">;
  builds: Pick<ReleaseBuildService, "build">;
  releases: Pick<AppReleaseDAO, "linkTicket">;
  audit: Pick<AuditRecorder, "record">;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Accepts an App space task's change once its latest commit ran in a preview:
 * merges it on the code host, closes the task, and starts building the release
 * that takes it live.
 */
export class MakeLiveService {
  constructor(private readonly deps: MakeLiveDependencies) {}

  /** Returns the commit the merge made. */
  async makeLive(actorId: string, ticketId: string, change: { pullRequestUrl: string; headSha: string }): Promise<string> {
    if (!(await this.deps.policy.describe(actorId, ticketId)).canMakeLive) {
      throw new AppChangeError("NOT_ALLOWED", "Only the task's owner, this space's maintainers or a workspace admin can make its change live.");
    }
    const [projectId, task] = await Promise.all([this.deps.owners.projectIdForTask(ticketId), this.deps.tickets.getSummary(ticketId)]);
    if (!projectId || task?.backingKind !== "app") throw new AppChangeError("NOT_AN_APP_SPACE", "Only changes to an app are made live.");
    const changes = await this.deps.pullRequests.listForTask(ticketId);
    if (!changes.some((pullRequest) => pullRequest.url === change.pullRequestUrl)) {
      throw new AppChangeError("NO_SUCH_CHANGE", "This task has no such change.");
    }
    const preview = await this.deps.previews.findForChange(ticketId, change.pullRequestUrl);
    if (preview?.triedCommitSha !== change.headSha) {
      throw new AppChangeError("NOT_TRIED", "Try the change as it is now before making it live.");
    }

    const commitSha = await this.merge(projectId, change.pullRequestUrl, change.headSha);
    await this.deps.audit.record({
      action: "app.change_made_live",
      target: { type: "space", id: projectId },
      details: { taskId: ticketId, pullRequestUrl: change.pullRequestUrl, commitSha },
    });
    // The merge is done; what follows catches up by itself if it fails.
    const actor = await this.deps.users.findById(actorId);
    const notRecorded = await this.deps.outcomes.check(change.pullRequestUrl, projectId, { madeLiveBy: actor?.name ?? "Someone" });
    if (notRecorded) logger.warn("Made a change live, but couldn't record the merge yet", { ticketId, reason: notRecorded });
    await this.startRelease(projectId, commitSha, ticketId);
    return commitSha;
  }

  private async merge(projectId: string, pullRequestUrl: string, headSha: string): Promise<string> {
    const repository = await this.deps.repositories.resolve(projectId);
    if ("unavailable" in repository) throw new AppChangeError("REPOSITORY_UNAVAILABLE", repository.unavailable);
    try {
      return await repository.host.mergePullRequest(pullRequestUrl, repository.token, { expectedHeadSha: headSha });
    } catch (error) {
      if (error instanceof PullRequestMergeError) throw new AppChangeError(error.code, error.message);
      if (error instanceof RepositoryAccessError) throw new AppChangeError("REPOSITORY_UNAVAILABLE", error.message);
      throw error;
    }
  }

  /** Without waiting for the branch poll, which would build the same commit a minute later without knowing its task. */
  private async startRelease(projectId: string, commitSha: string, ticketId: string): Promise<void> {
    try {
      const scmConfig = await this.deps.scmConfigs.getByProjectId(projectId);
      if (!scmConfig) return;
      const release = await this.deps.builds.build(scmConfig, commitSha, { ticketId });
      if (!release) await this.deps.releases.linkTicket(projectId, commitSha, ticketId);
    } catch (error) {
      logger.warn("Couldn't start the release of a change made live; the branch poll will", { projectId, commitSha, error: message(error) });
    }
  }
}
