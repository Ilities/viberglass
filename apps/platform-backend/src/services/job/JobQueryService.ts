import { sql } from "kysely";
import db from "../../persistence/config/database";
import type { JobStatus, JobStatusResponse } from "../../types/Job";
import { readJobFailure } from "./readJobFailure";

/** What the platform shows about runs: one run in full, the runs of a space or task, and the queue. */
export class JobQueryService {
  async getJobStatus(jobId: string): Promise<JobStatusResponse | null> {
    const job = await db
      .selectFrom("jobs")
      .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
      .leftJoin("clankers", "clankers.id", "jobs.clanker_id")
      .leftJoin("users as canceller", "canceller.id", "jobs.cancelled_by")
      .select([
        "jobs.id",
        "jobs.status",
        "jobs.progress",
        "jobs.last_heartbeat",
        "canceller.id as canceller_id",
        "canceller.name as canceller_name",
        "jobs.repository",
        "jobs.task",
        "jobs.branch",
        "jobs.base_branch",
        "jobs.context",
        "jobs.settings",
        "jobs.result",
        "jobs.error_message",
        "jobs.created_at",
        "jobs.started_at",
        "jobs.finished_at",
        "jobs.tenant_id",
        "jobs.ticket_id",
        "jobs.clanker_id",
        "jobs.job_kind",
        "jobs.agent_session_id",
        "tickets.id as ticket_uuid",
        "tickets.title as ticket_title",
        "tickets.external_ticket_id as ticket_external_id",
        "tickets.workflow_phase as ticket_workflow_phase",
        "clankers.id as clanker_uuid",
        "clankers.name as clanker_name",
        "clankers.slug as clanker_slug",
        "clankers.description as clanker_description",
        "clankers.agent as clanker_agent",
        // A session turn's job is linked from its turn; jobs.agent_session_id is not written.
        (eb) =>
          eb
            .selectFrom("agent_turns")
            .select("agent_turns.session_id")
            .whereRef("agent_turns.job_id", "=", "jobs.id")
            .limit(1)
            .as("turn_session_id"),
      ])
      .where("jobs.id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    // Fetch progress updates history
    const progressUpdates = await db
      .selectFrom("job_progress_updates")
      .selectAll()
      .where("job_id", "=", jobId)
      .orderBy("created_at", "desc")
      .execute();

    // Fetch log lines (most recent first, limited to 500)
    const logs = await db
      .selectFrom("job_log_lines")
      .selectAll()
      .where("job_id", "=", jobId)
      .orderBy("created_at", "desc")
      .limit(500)
      .execute();

    return {
      jobId: job.id,
      jobKind: job.job_kind,
      status: job.status,
      progress: job.progress,
      lastHeartbeat: job.last_heartbeat?.toISOString() || null,
      progressUpdates: progressUpdates.map((pu) => ({
        step: pu.step,
        message: pu.message,
        details: pu.details || null,
        createdAt: pu.created_at?.toISOString() || new Date().toISOString(),
      })),
      logs: logs
        .reverse() // Show oldest to newest for chronological reading
        .map((log) => ({
          id: log.id,
          level: log.level,
          message: log.message,
          source: log.source,
          createdAt: log.created_at?.toISOString() || new Date().toISOString(),
        })),
      data: {
        id: job.id,
        jobKind: job.job_kind,
        tenantId: job.tenant_id,
        repository: job.repository,
        task: job.task,
        branch: job.branch,
        baseBranch: job.base_branch,
        context: job.context,
        settings: job.settings,
        timestamp: job.created_at?.getTime() || Date.now(),
      },
      result: job.result,
      failedReason: job.error_message,
      cancelledBy: job.canceller_id && job.canceller_name ? { id: job.canceller_id, name: job.canceller_name } : null,
      createdAt: job.created_at,
      processedAt: job.started_at,
      finishedAt: job.finished_at,
      ticketId: job.ticket_id,
      ticket: job.ticket_id
        ? {
            id: job.ticket_uuid,
            title: job.ticket_title,
            externalTicketId: job.ticket_external_id,
            workflowPhase: job.ticket_workflow_phase,
          }
        : null,
      agentSessionId: job.agent_session_id ?? job.turn_session_id ?? null,
      clankerId: job.clanker_id,
      clanker: job.clanker_id
        ? {
            id: job.clanker_uuid ?? job.clanker_id,
            name: job.clanker_name ?? "Unknown",
            slug: job.clanker_slug ?? "unknown",
            description: job.clanker_description ?? null,
            agent: job.clanker_agent ?? null,
          }
        : null,
    };
  }

  async listJobs(options?: {
    status?: JobStatus;
    limit?: number;
    projectSlug?: string;
    ticketId?: string;
    /** Limits the list to runs in these spaces; null or omitted means all. */
    projectIds?: string[] | null;
  }): Promise<{ jobs: Record<string, unknown>[]; count: number }> {
    const { status, limit = 10, projectSlug, ticketId, projectIds = null } = options || {};
    if (projectIds && projectIds.length === 0) return { jobs: [], count: 0 };

    let projectId: string | undefined;

    // If projectSlug is provided, look up the actual project UUID
    if (projectSlug) {
      const project = await db
        .selectFrom("projects")
        .select("id")
        .where("slug", "=", projectSlug)
        .executeTakeFirst();

      if (!project) {
        return { jobs: [], count: 0 };
      }

      projectId = project.id;
    }

    // Build base query with joins to get project slug for each job
    let query = db
      .selectFrom("jobs")
      .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
      .leftJoin("projects", "projects.id", "tickets.project_id");

    if (status) {
      query = query.where("jobs.status", "=", status);
    }

    if (ticketId) {
      query = query.where("jobs.ticket_id", "=", ticketId);
    }

    // Filter by project: ticket-based jobs via tickets.project_id,
    // ticketless jobs (e.g. claw) via tenant_id which is set to project.id
    if (projectId) {
      query = query.where((eb) =>
        eb.or([
          eb("tickets.project_id", "=", projectId),
          eb.and([
            eb("jobs.ticket_id", "is", null),
            eb("jobs.tenant_id", "=", projectId),
          ]),
        ]),
      );
    }

    if (projectIds) {
      query = query.where((eb) =>
        eb.or([
          eb("tickets.project_id", "in", projectIds),
          eb.and([eb("jobs.ticket_id", "is", null), eb("jobs.tenant_id", "in", projectIds)]),
        ]),
      );
    }

    const jobs = await query
      .select([
        "jobs.id",
        "jobs.status",
        "jobs.repository",
        "jobs.task",
        "jobs.tenant_id",
        "jobs.created_at",
        "jobs.started_at",
        "jobs.finished_at",
        "jobs.ticket_id",
        "jobs.job_kind",
        "jobs.clanker_id",
        sql<unknown>`jobs.result -> 'failure'`.as("failure"),
        "tickets.id as ticket_id",
        "tickets.title as ticket_title",
        "tickets.external_ticket_id as ticket_external_id",
        "projects.slug as project_slug",
      ])
      .orderBy("jobs.created_at", "desc")
      .limit(limit)
      .execute();

    const jobsData = jobs.map((job) => {
      return {
        jobId: job.id,
        jobKind: job.job_kind,
        status: job.status,
        repository: job.repository,
        task: job.task,
        tenantId: job.tenant_id,
        createdAt: job.created_at,
        processedAt: job.started_at,
        finishedAt: job.finished_at,
        ticketId: job.ticket_id,
        clankerId: job.clanker_id,
        projectSlug: job.project_slug,
        failure: readJobFailure(job.failure),
        ticket: job.ticket_id
          ? {
              id: job.ticket_id,
              title: job.ticket_title,
              externalTicketId: job.ticket_external_id,
            }
          : null,
      };
    });

    return { jobs: jobsData, count: jobsData.length };
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    queue: "agent-jobs";
    total: number;
  }> {
    const stats = await db
      .selectFrom("jobs")
      .select([
        sql<string>`COUNT(*) FILTER (WHERE status = 'queued')`.as("waiting"),
        sql<string>`COUNT(*) FILTER (WHERE status = 'active')`.as("active"),
        sql<string>`COUNT(*) FILTER (WHERE status = 'completed')`.as(
          "completed",
        ),
        sql<string>`COUNT(*) FILTER (WHERE status = 'failed')`.as("failed"),
      ])
      .executeTakeFirst();

    const waiting = parseInt(stats?.waiting || "0");
    const active = parseInt(stats?.active || "0");
    const completed = parseInt(stats?.completed || "0");
    const failed = parseInt(stats?.failed || "0");

    return {
      queue: "agent-jobs",
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  // Helper method to get next queued job for processing
}
