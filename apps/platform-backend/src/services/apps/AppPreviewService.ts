import { randomBytes } from "crypto";
import { PREVIEW_ADDRESS_PREFIX, type AppPreview, type AppRelease, type TryChangeRequest } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppPreviewDAO, AppPreviewRecord } from "../../persistence/apps/AppPreviewDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import type { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { AppChangeError } from "./AppChangeError";
import type { AppOrigins } from "./AppOrigins";
import type { AppPreviewReconciler } from "./AppPreviewReconciler";
import type { ReleaseBuildService } from "./ReleaseBuildService";

const logger = createChildLogger({ service: "AppPreviewService" });

const ADDRESS_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const ADDRESS_LENGTH = 8;

/** `preview-` and eight random letters and digits, a valid host label. */
export function newPreviewAddress(): string {
  const bytes = randomBytes(ADDRESS_LENGTH);
  return PREVIEW_ADDRESS_PREFIX + Array.from(bytes, (byte) => ADDRESS_ALPHABET[byte % ADDRESS_ALPHABET.length]).join("");
}

export interface AppPreviewDependencies {
  policy: Pick<TaskAskPolicyService, "describe">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  tickets: Pick<TicketDAO, "getSummary">;
  pullRequests: Pick<TaskPullRequestDAO, "listForTask">;
  scmConfigs: Pick<ProjectScmConfigDAO, "getByProjectId">;
  releases: Pick<AppReleaseDAO, "findPreviewBuild" | "delete">;
  builds: Pick<ReleaseBuildService, "build">;
  previews: Pick<AppPreviewDAO, "findForChange" | "create" | "request" | "listForTask">;
  reconciler: Pick<AppPreviewReconciler, "reconcile">;
  origins: Pick<AppOrigins, "originFor">;
}

/** Trying an App space task's change: building it and running it as a preview. */
export class AppPreviewService {
  constructor(private readonly deps: AppPreviewDependencies) {}

  async listForTask(ticketId: string): Promise<AppPreview[]> {
    return (await this.deps.previews.listForTask(ticketId)).map((preview) => this.view(preview));
  }

  /** Try it: builds the change at `headSha` unless it's built already, and turns its preview on. */
  async tryChange(actorId: string, ticketId: string, change: TryChangeRequest): Promise<AppPreview> {
    if (!(await this.deps.policy.describe(actorId, ticketId)).canPost) {
      throw new AppChangeError("NOT_ALLOWED", "Viewers can open a preview, but not start one.");
    }
    const [projectId, task] = await Promise.all([this.deps.owners.projectIdForTask(ticketId), this.deps.tickets.getSummary(ticketId)]);
    if (!projectId || task?.backingKind !== "app") throw new AppChangeError("NOT_AN_APP_SPACE", "Only changes to an app have previews.");
    const changes = await this.deps.pullRequests.listForTask(ticketId);
    if (!changes.some((pullRequest) => pullRequest.url === change.pullRequestUrl)) {
      throw new AppChangeError("NO_SUCH_CHANGE", "This task has no such change.");
    }

    const build = await this.buildFor(projectId, change.headSha);
    const preview = await this.previewFor(projectId, ticketId, change.pullRequestUrl, build);
    await this.deps.previews.request(preview.id, { commitSha: change.headSha, releaseId: build.id });
    this.deps.reconciler.reconcile(preview.id).catch((error: unknown) => {
      logger.error("Starting a preview failed", { previewId: preview.id, error: error instanceof Error ? error.message : String(error) });
    });
    const requested = await this.deps.previews.findForChange(ticketId, change.pullRequestUrl);
    return this.view(requested ?? preview);
  }

  /** A build that failed is tried again, since the cause may have been passing. */
  private async buildFor(projectId: string, commitSha: string): Promise<AppRelease> {
    const existing = await this.deps.releases.findPreviewBuild(projectId, commitSha);
    if (existing && existing.status !== "failed") return existing;
    if (existing) await this.deps.releases.delete(existing.id);

    const scmConfig = await this.deps.scmConfigs.getByProjectId(projectId);
    if (!scmConfig) throw new AppChangeError("REPOSITORY_UNAVAILABLE", "This App space has no repository to build from.");
    const started = await this.deps.builds.build(scmConfig, commitSha, { preview: true });
    const build = started ?? (await this.deps.releases.findPreviewBuild(projectId, commitSha));
    if (!build) throw new Error(`The preview build of ${commitSha.slice(0, 7)} disappeared`);
    return build;
  }

  private async previewFor(projectId: string, ticketId: string, pullRequestUrl: string, build: AppRelease): Promise<AppPreviewRecord> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.deps.previews.findForChange(ticketId, pullRequestUrl);
      if (existing) return existing;
      // Null when another Try it created it first, or, rarely, the address was taken.
      const created = await this.deps.previews.create({
        address: newPreviewAddress(),
        projectId,
        ticketId,
        pullRequestUrl,
        commitSha: build.commitSha,
        releaseId: build.id,
      });
      if (created) return created;
    }
    throw new Error("Could not give the preview an address");
  }

  private view(preview: AppPreviewRecord): AppPreview {
    return {
      id: preview.id,
      pullRequestUrl: preview.pullRequestUrl,
      commitSha: preview.commitSha,
      power: preview.power,
      state: preview.state,
      statusMessage: preview.statusMessage,
      triedCommitSha: preview.triedCommitSha,
      url: this.deps.origins.originFor(preview.address),
    };
  }
}
