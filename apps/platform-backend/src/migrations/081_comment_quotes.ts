import { Kysely } from "kysely";
import { quoteForLine } from "@viberglass/types";

// Comments on the rendered document (phase-2-3-handover §2.8): each comment
// is anchored to the text it's on (a W3C text quote) instead of a source line.
// Existing line comments get a quote built from the text on their line, as
// the document reads now; a comment on a blank line keeps only its line.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("ticket_phase_document_comments")
    .addColumn("quote_exact", "text")
    .addColumn("quote_prefix", "text")
    .addColumn("quote_suffix", "text")
    .execute();

  const comments = await db
    .selectFrom("ticket_phase_document_comments as c")
    .innerJoin("ticket_phase_documents as d", "d.id", "c.document_id")
    .select(["c.id", "c.line_number", "d.content"])
    .execute();
  for (const comment of comments) {
    const quote = quoteForLine(comment.content, comment.line_number);
    if (!quote) continue;
    await db
      .updateTable("ticket_phase_document_comments")
      .set({ quote_exact: quote.exact, quote_prefix: quote.prefix, quote_suffix: quote.suffix })
      .where("id", "=", comment.id)
      .execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("ticket_phase_document_comments")
    .dropColumn("quote_exact")
    .dropColumn("quote_prefix")
    .dropColumn("quote_suffix")
    .execute();
}
