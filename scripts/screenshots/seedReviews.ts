import { sql } from "kysely";
import { quoteAt } from "@viberglass/types";
import db from "../../apps/platform-backend/src/persistence/config/database";
import { activity, touch } from "./seedSupport";

/** Saves a plan version the way an agent turn does, and keeps the document on the latest one. */
export async function planVersion(ticketId: string, content: string, at: Date, agentTurnId: string | null): Promise<string> {
  const existing = await db.selectFrom("ticket_phase_documents").select("id").where("ticket_id", "=", ticketId).where("phase", "=", "planning").executeTakeFirst();
  const documentId =
    existing?.id ??
    (await db.insertInto("ticket_phase_documents").values({ ticket_id: ticketId, phase: "planning", content, created_at: at }).returning("id").executeTakeFirstOrThrow()).id;
  await db.updateTable("ticket_phase_documents").set({ content }).where("id", "=", documentId).execute();
  const latest = await db
    .selectFrom("ticket_phase_document_revisions")
    .select(sql<number>`coalesce(max(version), 0)`.as("version"))
    .where("document_id", "=", documentId)
    .executeTakeFirstOrThrow();
  await db
    .insertInto("ticket_phase_document_revisions")
    .values({ document_id: documentId, ticket_id: ticketId, phase: "planning", content, source: "agent", version: Number(latest.version) + 1, agent_turn_id: agentTurnId, created_at: at })
    .execute();
  touch(ticketId, at);
  return documentId;
}

export async function planComment(ticketId: string, documentId: string, plan: string, quote: string, content: string, author: { id: string; email: string }, at: Date): Promise<void> {
  const start = plan.indexOf(quote);
  if (start < 0) throw new Error(`The plan doesn't contain "${quote}"`);
  const anchor = quoteAt(plan, start, start + quote.length);
  const row = await db
    .insertInto("ticket_phase_document_comments")
    .values({
      document_id: documentId,
      ticket_id: ticketId,
      phase: "planning",
      line_number: plan.slice(0, start).split("\n").length,
      quote_exact: anchor.exact,
      quote_prefix: anchor.prefix,
      quote_suffix: anchor.suffix,
      content,
      actor: author.email,
      created_at: at,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await activity(ticketId, "comment_added", author.id, { step: "planning", quote: anchor.exact.slice(0, 80), commentId: row.id, comment: content.slice(0, 600) }, at);
}

export async function pullRequest(ticketId: string, branch: string, url: string, outcome: { state: "open" | "merged" | "closed"; reviewComments: number; at: Date }): Promise<void> {
  await db.insertInto("task_pull_requests").values({ ticket_id: ticketId, branch, url, created_at: outcome.at }).execute();
  await db
    .insertInto("pull_request_outcomes")
    .values({
      pull_request_url: url,
      state: outcome.state,
      merged_at: outcome.state === "merged" ? outcome.at : null,
      closed_at: outcome.state === "closed" ? outcome.at : null,
      comment_count: outcome.reviewComments + 1,
      review_comment_count: outcome.reviewComments,
      checked_at: new Date(),
    })
    .onConflict((oc) => oc.column("pull_request_url").doNothing())
    .execute();
  touch(ticketId, outcome.at);
}
