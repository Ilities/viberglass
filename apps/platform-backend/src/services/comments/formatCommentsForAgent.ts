import type { PhaseDocumentComment } from "../../persistence/ticketing/TicketPhaseDocumentCommentDAO";

/** How the UI marks a comment that suggests new wording for the text it's on. */
export const SUGGESTION_PREFIX = "@@SUGGESTION@@\n";

const QUOTE_LIMIT = 200;

function shorten(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > QUOTE_LIMIT ? `${oneLine.slice(0, QUOTE_LIMIT)}…` : oneLine;
}

/** Open comments as the agent reads them: the text each is on, who wrote it, and what it asks. */
export function formatCommentsForAgent(
  comments: Array<Pick<PhaseDocumentComment, "lineNumber" | "quote" | "content" | "actor">>,
): string | undefined {
  if (comments.length === 0) return undefined;
  return comments
    .map((comment) => {
      const where = comment.quote ? `On “${shorten(comment.quote.exact)}” (line ${comment.lineNumber})` : `Line ${comment.lineNumber}`;
      const by = comment.actor ? ` (by ${comment.actor})` : "";
      if (comment.content.startsWith(SUGGESTION_PREFIX)) {
        return `- ${where}${by}: **Suggestion:** replace it with “${comment.content.slice(SUGGESTION_PREFIX.length)}”`;
      }
      return `- ${where}${by}: ${comment.content}`;
    })
    .join("\n");
}
