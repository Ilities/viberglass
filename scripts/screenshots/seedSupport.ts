import { randomUUID } from "crypto";
import { sql } from "kysely";
import type { TaskTurnAction } from "@viberglass/types";
import db from "../../apps/platform-backend/src/persistence/config/database";
import { TaskMessageDAO } from "../../apps/platform-backend/src/persistence/ticketing/TaskMessageDAO";

export const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);
const plus = (at: Date, minutes: number): Date => new Date(at.getTime() + minutes * 60_000);

export interface Runner {
  id: string;
  name: string;
  agent: "claude-code" | "opencode";
  model: string;
  harnessVersion: string;
}

export interface Session {
  id: string;
  ticketId: string;
  projectId: string;
  runner: Runner;
  turns: number;
  events: number;
}

/** The latest moment the seed wrote for each task, so its "updated" time can match. */
export const lastTouched = new Map<string, Date>();
export const touch = (ticketId: string, at: Date) => {
  const current = lastTouched.get(ticketId);
  if (!current || current < at) lastTouched.set(ticketId, at);
};

export async function backdateTask(ticketId: string, createdAt: Date): Promise<void> {
  await db.updateTable("tickets").set({ created_at: createdAt, timestamp: createdAt }).where("id", "=", ticketId).execute();
  await db.updateTable("task_activity").set({ created_at: createdAt }).where("ticket_id", "=", ticketId).where("kind", "=", "task_created").execute();
  touch(ticketId, createdAt);
}

export async function activity(ticketId: string, kind: string, actorId: string | null, payload: Record<string, unknown>, at: Date): Promise<void> {
  await db
    .insertInto("task_activity")
    .values({ ticket_id: ticketId, actor_type: actorId ? "human" : "system", actor_id: actorId, kind, payload_json: JSON.stringify(payload), created_at: at })
    .execute();
  touch(ticketId, at);
}

export async function message(ticketId: string, authorId: string, body: string, at: Date, mentionedUserIds: string[] = []): Promise<string> {
  const id = await new TaskMessageDAO().create({ ticketId, authorId, body, mentionedUserIds });
  await db.updateTable("task_messages").set({ created_at: at }).where("id", "=", id).execute();
  await db.updateTable("task_mentions").set({ created_at: at }).where("ticket_id", "=", ticketId).where("created_at", ">", plus(at, -1)).execute();
  touch(ticketId, at);
  return id;
}

export async function session(ticketId: string, projectId: string, runner: Runner, createdBy: string, at: Date): Promise<Session> {
  const row = await db
    .insertInto("agent_sessions")
    .values({ tenant_id: "api-server", project_id: projectId, ticket_id: ticketId, clanker_id: runner.id, mode: "planning", status: "completed", created_by: createdBy, created_at: at })
    .returning("id")
    .executeTakeFirstOrThrow();
  return { id: row.id, ticketId, projectId, runner, turns: 0, events: 0 };
}

export interface TranscriptStep {
  kind: "reasoning" | "message" | "tool";
  text: string;
  /** For a tool: what it ran or read, and what came back. */
  tool?: { name: string; toolKind: "read" | "edit" | "search" | "execute"; input: Record<string, string>; output: string };
}

export interface RunInput {
  session: Session;
  action: TaskTurnAction;
  status: "completed" | "failed" | "running" | "blocked";
  startedAt: Date;
  minutes: number;
  /** What the person asked, as the turn's prompt. */
  ask: { userId: string; text: string };
  intent: string;
  reply: string;
  produced?: Array<"plan" | "code" | "summary">;
  mentioned?: Array<{ id: string; name: string }>;
  repository: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  pullRequestUrl?: string;
  branch?: string;
  transcript?: TranscriptStep[];
  logs?: string[];
  /** A Files space runs every turn as a reply job. */
  jobKind?: "planning" | "execution" | "reply";
  files?: Record<string, unknown>;
  artifacts?: unknown[];
}

const JOB_KIND: Record<TaskTurnAction, "planning" | "execution" | "reply"> = { plan: "planning", code: "execution", reply: "reply", summarise: "reply" };

/** One agent turn as the platform records it: the person's ask, the job, its manifest, transcript and log, and the agent's turn. */
export async function run(input: RunInput): Promise<{ jobId: string; turnId: string; finishedAt: Date }> {
  const { session: s } = input;
  const jobId = `job_${input.startedAt.getTime()}_${randomUUID().slice(0, 8)}`;
  const finishedAt = plus(input.startedAt, input.minutes);
  const finished = input.status === "completed" || input.status === "failed" || input.status === "blocked";
  const kind = input.jobKind ?? JOB_KIND[input.action];
  const jobStatus = input.status === "running" ? "active" : input.status === "blocked" ? "completed" : input.status;
  const branch = input.branch ?? null;

  await db
    .insertInto("jobs")
    .values({
      id: jobId,
      tenant_id: "api-server",
      repository: input.repository,
      task: input.ask.text,
      branch,
      base_branch: "main",
      context: JSON.stringify({ instructionFiles: [{ fileType: "AGENTS.md", content: "Use the existing checkout helpers. Write tests next to the code they test." }] }),
      status: jobStatus,
      result: finished
        ? JSON.stringify({
            success: input.status !== "failed",
            changedFiles: [],
            executionTime: input.minutes * 60_000,
            ...(input.pullRequestUrl ? { pullRequestUrl: input.pullRequestUrl, branch } : {}),
            ...(input.status === "failed" ? { errorMessage: "The agent stopped: the model provider returned 529 (overloaded) three times." } : {}),
          })
        : null,
      error_message: input.status === "failed" ? "The model provider returned 529 (overloaded) three times." : null,
      created_at: plus(input.startedAt, -0.2),
      started_at: input.startedAt,
      finished_at: finished ? finishedAt : null,
      ticket_id: s.ticketId,
      clanker_id: s.runner.id,
      job_kind: kind,
      worker_type: "docker",
      // A running job far from its heartbeat deadline, so the sweeper leaves it be.
      last_heartbeat: input.status === "running" ? hoursAgo(-24 * 30) : null,
    })
    .execute();

  await db
    .insertInto("job_run_manifests")
    .values({
      job_id: jobId,
      manifest_version: 1,
      tenant_id: "api-server",
      job_kind: kind,
      ticket_id: s.ticketId,
      project_id: s.projectId,
      clanker_id: s.runner.id,
      requested_agent: s.runner.agent,
      requested_model: s.runner.model,
      repository: input.repository,
      base_branch: "main",
      worker_type: "docker",
      dispatched_at: input.startedAt,
      agent: finished ? s.runner.agent : null,
      harness_version: finished ? s.runner.harnessVersion : null,
      model_snapshot: finished ? s.runner.model : null,
      branch,
      pull_request_url: input.pullRequestUrl ?? null,
      changed_file_count: input.produced?.includes("code") ? 6 : 1,
      usage: finished ? JSON.stringify({ inputTokens: input.inputTokens ?? 48_000, outputTokens: input.outputTokens ?? 3_900 }) : null,
      usage_available: finished,
      cost_usd: finished ? (input.costUsd ?? 0.42) : null,
      cost_provenance: finished ? "actual" : null,
      stop_reason: finished ? (input.status === "failed" ? "failed" : "completed") : null,
      success: finished ? input.status !== "failed" : null,
      started_at: input.startedAt,
      finished_at: finished ? finishedAt : null,
      duration_ms: finished ? input.minutes * 60_000 : null,
    })
    .execute();

  await db
    .insertInto("agent_turns")
    .values({
      session_id: s.id,
      role: "user",
      status: "completed",
      sequence: ++s.turns,
      content_markdown: input.ask.text,
      user_id: input.ask.userId,
      action: input.action,
      created_at: plus(input.startedAt, -0.3),
      completed_at: plus(input.startedAt, -0.3),
    })
    .execute();

  const outcome = {
    intent: input.intent,
    reply: `${input.intent}\n\n${input.reply}`,
    produced: input.produced ?? [],
    codeDiscarded: false,
    resumed: s.turns > 1,
    mentioned: input.mentioned ?? [],
    contextUsage: { used: (input.inputTokens ?? 48_000) + 12_000, size: 200_000 },
    compacted: false,
    commit: input.produced?.includes("code") ? randomUUID().replace(/-/g, "").slice(0, 40) : null,
    ...(input.files ? { files: input.files } : {}),
    ...(input.artifacts ? { artifacts: input.artifacts } : {}),
  };
  const turn = await db
    .insertInto("agent_turns")
    .values({
      session_id: s.id,
      role: "assistant",
      status: input.status,
      sequence: ++s.turns,
      content_markdown: input.status === "running" ? null : outcome.reply,
      content_json: input.status === "running" ? null : JSON.stringify(outcome),
      job_id: jobId,
      action: input.action,
      created_at: input.startedAt,
      started_at: input.startedAt,
      completed_at: finished ? finishedAt : null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await transcript(s, turn.id, jobId, input.startedAt, input.transcript ?? [], finished ? input.reply : null);
  await logs(jobId, input.startedAt, input.logs ?? []);
  await db
    .updateTable("agent_sessions")
    .set({ last_job_id: jobId, last_turn_id: turn.id, status: input.status === "running" ? "active" : input.status === "blocked" ? "waiting_on_user" : "completed" })
    .where("id", "=", s.id)
    .execute();
  touch(s.ticketId, finished ? finishedAt : input.startedAt);
  return { jobId, turnId: turn.id, finishedAt };
}

async function transcript(s: Session, turnId: string, jobId: string, startedAt: Date, steps: TranscriptStep[], reply: string | null): Promise<void> {
  const rows: Array<{ type: "reasoning" | "assistant_message" | "tool_call_started" | "tool_call_completed"; payload: Record<string, unknown> }> = [];
  steps.forEach((step, index) => {
    if (step.kind === "reasoning") rows.push({ type: "reasoning", payload: { text: step.text } });
    if (step.kind === "message") rows.push({ type: "assistant_message", payload: { text: step.text } });
    if (step.kind === "tool" && step.tool) {
      const toolCallId = `call_${index}`;
      rows.push({ type: "tool_call_started", payload: { toolCallId, toolName: step.tool.name, kind: step.tool.toolKind, input: step.tool.input, locations: Object.values(step.tool.input) } });
      rows.push({ type: "tool_call_completed", payload: { toolCallId, toolName: step.tool.name, success: true, output: step.tool.output, error: null } });
    }
  });
  if (reply) rows.push({ type: "assistant_message", payload: { text: reply } });
  if (rows.length === 0) return;
  await db
    .insertInto("agent_session_events")
    .values(
      rows.map((row, index) => ({
        session_id: s.id,
        turn_id: turnId,
        job_id: jobId,
        sequence: ++s.events,
        event_type: row.type,
        payload_json: JSON.stringify(row.payload),
        created_at: plus(startedAt, index * 0.15),
      })),
    )
    .execute();
}

async function logs(jobId: string, startedAt: Date, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await db
    .insertInto("job_log_lines")
    .values(lines.map((line, index) => ({ id: randomUUID(), job_id: jobId, level: "info" as const, message: line, source: "worker", created_at: plus(startedAt, index * 0.1) })))
    .execute();
}

export async function question(
  s: Session,
  turnId: string,
  jobId: string,
  input: { question: string; options: string[]; addresseeId: string; at: Date },
  answer?: { by: string; text: string; at: Date },
): Promise<string> {
  const row = await db
    .insertInto("agent_pending_requests")
    .values({
      session_id: s.id,
      turn_id: turnId,
      job_id: jobId,
      request_type: "input",
      status: answer ? "resolved" : "open",
      prompt_markdown: input.question,
      options_json: JSON.stringify(input.options),
      blocking: true,
      addressee_user_id: input.addresseeId,
      created_at: input.at,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await activity(s.ticketId, "question_asked", null, { questionId: row.id, userId: input.addresseeId, question: input.question, blocking: true }, input.at);
  if (answer) {
    const messageId = await message(s.ticketId, answer.by, answer.text, answer.at);
    await db
      .updateTable("agent_pending_requests")
      .set({ response_json: JSON.stringify({ answer: answer.text }), resolved_by: answer.by, resolved_at: answer.at, answer_message_id: messageId })
      .where("id", "=", row.id)
      .execute();
  } else {
    await db.updateTable("agent_sessions").set({ latest_pending_request_id: row.id, status: "waiting_on_user" }).where("id", "=", s.id).execute();
  }
  return row.id;
}

/** Sets each task's "updated" time to the last thing that happened on it; a trigger would otherwise stamp it now. */
export async function settleUpdatedTimes(): Promise<void> {
  await sql`ALTER TABLE tickets DISABLE TRIGGER USER`.execute(db);
  try {
    for (const [ticketId, at] of lastTouched) {
      await db.updateTable("tickets").set({ updated_at: at }).where("id", "=", ticketId).execute();
    }
  } finally {
    await sql`ALTER TABLE tickets ENABLE TRIGGER USER`.execute(db);
  }
}
