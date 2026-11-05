import { randomUUID } from "node:crypto";
import { appDataGrantKey, type AppDataGrant } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDataGrantDAO, AppDataGrantRecord } from "../../persistence/apps/AppDataGrantDAO";
import type { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import type { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import type { UserDAO } from "../../persistence/user/UserDAO";
import type { AuditRecorder } from "../audit/AuditRecorder";
import type { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import type { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import type { AppDataCopier } from "./AppDataCopier";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppDataGrantService" });

export interface AppDataGrantDependencies {
  policy: Pick<TaskAskPolicyService, "describe">;
  owners: Pick<SpaceOwnershipDAO, "projectIdForTask">;
  tickets: Pick<TicketDAO, "getSummary">;
  grants: Pick<AppDataGrantDAO, "untaken" | "insert" | "markRemoved">;
  copier: Pick<AppDataCopier, "copy" | "remove">;
  users: Pick<UserDAO, "findById">;
  activity: Pick<TaskActivityRecorder, "record">;
  audit: Pick<AuditRecorder, "record">;
}

/**
 * The agent sees only the code of an app, so its data's schema. A maintainer
 * can give one turn on a task a copy of the live data to read; the turn that
 * takes it gets it, and nothing after it.
 */
export class AppDataGrantService {
  constructor(private readonly deps: AppDataGrantDependencies) {}

  async waiting(ticketId: string): Promise<AppDataGrant | null> {
    const grant = await this.deps.grants.untaken(ticketId);
    return grant ? this.view(grant) : null;
  }

  async grant(actorId: string, ticketId: string): Promise<AppDataGrant> {
    const projectId = await this.assertMayGrant(actorId, ticketId);
    const id = randomUUID();
    const key = appDataGrantKey(projectId, id);
    const copied = await this.deps.copier.copy(projectId, key);
    const replaced = await this.deps.grants.untaken(ticketId);
    if (replaced) await this.remove(replaced);
    const grant = await this.deps.grants.insert({ id, projectId, ticketId, grantedBy: actorId, copiedAt: copied.copiedAt, objectKey: key, bytes: copied.bytes });
    await this.deps.audit.record({
      action: "app.data_granted",
      target: { type: "space", id: projectId },
      details: { taskId: ticketId, bytes: copied.bytes },
    });
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, "app_data_granted", { copiedAt: copied.copiedAt.toISOString() });
    return this.view(grant);
  }

  async withdraw(actorId: string, ticketId: string): Promise<void> {
    await this.assertMayGrant(actorId, ticketId);
    const grant = await this.deps.grants.untaken(ticketId);
    if (!grant) throw new AppSpaceError("GRANT_NOT_FOUND", "No copy of the app's data is waiting for this task's next turn.");
    await this.remove(grant);
    await this.deps.activity.record(ticketId, { type: "human", userId: actorId }, "app_data_grant_withdrawn", {});
  }

  private async assertMayGrant(actorId: string, ticketId: string): Promise<string> {
    if (!(await this.deps.policy.describe(actorId, ticketId)).canGrantAppData) {
      throw new AppSpaceError("NOT_ALLOWED", "Only this space's maintainers and workspace admins can give the agent the app's data.");
    }
    const [projectId, task] = await Promise.all([this.deps.owners.projectIdForTask(ticketId), this.deps.tickets.getSummary(ticketId)]);
    if (!projectId || task?.backingKind !== "app") throw new AppSpaceError("NOT_AN_APP_SPACE", "This task's space has no app.");
    return projectId;
  }

  private async remove(grant: AppDataGrantRecord): Promise<void> {
    await this.deps.grants.markRemoved(grant.id);
    // The sweep never sees a removed row again, so a copy that stays behind is only reclaimed with the space.
    await this.deps.copier.remove(grant.objectKey).catch((error: unknown) => {
      logger.warn("Couldn't delete a copy of an app's data", { grantId: grant.id, error: error instanceof Error ? error.message : String(error) });
    });
  }

  private async view(grant: AppDataGrantRecord): Promise<AppDataGrant> {
    const by = grant.grantedBy ? await this.deps.users.findById(grant.grantedBy) : null;
    return { id: grant.id, copiedAt: grant.copiedAt.toISOString(), grantedBy: by?.name ?? null };
  }
}
