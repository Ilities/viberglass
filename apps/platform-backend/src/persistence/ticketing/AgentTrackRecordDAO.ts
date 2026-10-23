import { sql } from "kysely";
import type { AgentTrackRecordTask } from "@viberglass/types";
import db from "../config/database";

export interface CreditedTask extends AgentTrackRecordTask {
  agent: string;
  model: string | null;
}

interface Row {
  ticket_id: string;
  task_key: string;
  title: string;
  agent: string;
  model: string | null;
  runs: string;
  failed_runs: string;
  built: boolean;
  cost_usd: string | null;
  cost_estimated: boolean | null;
  plan_rounds: string;
  questions: string;
  taken_over: boolean;
  pull_request: "merged" | "open" | "closed" | null;
  review_comments: string | null;
}

/** How each of a space's tasks went, credited to the harness and model of its latest build, else of its latest plan or reply. */
export class AgentTrackRecordDAO {
  async tasksOf(spaceId: string): Promise<CreditedTask[]> {
    const { rows } = await sql<Row>`
      WITH space_runs AS (
        SELECT j.ticket_id, j.job_kind, j.status, j.created_at,
               COALESCE(m.agent, m.requested_agent) AS agent,
               COALESCE(m.model_snapshot, m.requested_model) AS model,
               m.cost_usd, m.cost_provenance
        FROM jobs j
        JOIN tickets t ON t.id = j.ticket_id
        LEFT JOIN job_run_manifests m ON m.job_id = j.id
        WHERE t.project_id = ${spaceId} AND j.job_kind IN ('planning', 'execution', 'reply')
      ),
      credited AS (
        SELECT DISTINCT ON (ticket_id) ticket_id, agent, model
        FROM space_runs
        WHERE agent IS NOT NULL
        ORDER BY ticket_id, CASE job_kind WHEN 'execution' THEN 0 WHEN 'planning' THEN 1 ELSE 2 END, created_at DESC
      ),
      run_totals AS (
        SELECT ticket_id,
               count(*) AS runs,
               count(*) FILTER (WHERE status = 'failed') AS failed_runs,
               sum(cost_usd) AS cost_usd,
               bool_or(cost_provenance = 'estimated') AS cost_estimated,
               min(created_at) FILTER (WHERE job_kind = 'execution') AS first_build
        FROM space_runs
        GROUP BY ticket_id
      ),
      plan_rounds AS (
        SELECT r.ticket_id, count(*) AS plan_rounds
        FROM space_runs r
        JOIN run_totals rt ON rt.ticket_id = r.ticket_id
        WHERE r.job_kind = 'planning' AND r.status = 'completed' AND (rt.first_build IS NULL OR r.created_at < rt.first_build)
        GROUP BY r.ticket_id
      ),
      questions AS (
        SELECT s.ticket_id, count(*) AS questions
        FROM agent_pending_requests q
        JOIN agent_sessions s ON s.id = q.session_id
        WHERE q.request_type = 'input'
        GROUP BY s.ticket_id
      ),
      pull_requests AS (
        SELECT tp.ticket_id,
               CASE WHEN bool_or(o.state = 'merged') THEN 'merged'
                    WHEN bool_or(o.state = 'open') THEN 'open'
                    WHEN bool_or(o.state = 'closed') THEN 'closed' END AS pull_request,
               sum(o.review_comment_count) AS review_comments
        FROM task_pull_requests tp
        LEFT JOIN pull_request_outcomes o ON o.pull_request_url = tp.url
        GROUP BY tp.ticket_id
      )
      SELECT t.id AS ticket_id, t.task_key, t.title, c.agent, c.model,
             rt.runs, rt.failed_runs, rt.cost_usd, rt.cost_estimated, rt.first_build IS NOT NULL AS built,
             COALESCE(pr.plan_rounds, 0) AS plan_rounds,
             COALESCE(q.questions, 0) AS questions,
             EXISTS (SELECT 1 FROM task_activity a WHERE a.ticket_id = t.id AND a.kind = 'taken_over') AS taken_over,
             p.pull_request, p.review_comments
      FROM credited c
      JOIN tickets t ON t.id = c.ticket_id
      JOIN run_totals rt ON rt.ticket_id = c.ticket_id
      LEFT JOIN plan_rounds pr ON pr.ticket_id = c.ticket_id
      LEFT JOIN questions q ON q.ticket_id = c.ticket_id
      LEFT JOIN pull_requests p ON p.ticket_id = c.ticket_id
      ORDER BY t.created_at DESC
    `.execute(db);
    return rows.map(toCreditedTask);
  }
}

function toCreditedTask(row: Row): CreditedTask {
  return {
    ticketId: row.ticket_id,
    key: row.task_key,
    title: row.title,
    agent: row.agent,
    model: row.model,
    pullRequest: row.pull_request,
    built: row.built,
    planRounds: Number(row.plan_rounds),
    questions: Number(row.questions),
    takenOver: row.taken_over,
    runs: Number(row.runs),
    failedRuns: Number(row.failed_runs),
    reviewComments: row.review_comments === null ? null : Number(row.review_comments),
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    costEstimated: row.cost_estimated === true,
  };
}
