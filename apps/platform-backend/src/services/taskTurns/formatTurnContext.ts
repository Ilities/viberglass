import { withPlainMentions, type PullRequestReviewComment, type TaskArtifactKind } from "@viberglass/types";
import { formatCommentsForAgent } from "../comments/formatCommentsForAgent";
import { formatPullRequestComments } from "../pull-request-reviews/formatPullRequestComments";
import type { TurnComment, TurnEdit, TurnMessage } from "./taskTurnContext";

const ARTIFACT_NAME: Record<TaskArtifactKind, string> = { research: "research", plan: "plan" };

/**
 * People's words go inside tags, so angle brackets are escaped: a message
 * cannot close its tag and write instructions of its own.
 */
function escape(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escape(text).replace(/"/g, "&quot;");
}

function at(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatMessages(messages: TurnMessage[]): string | undefined {
  if (messages.length === 0) return undefined;
  return messages
    .map((message) => {
      const from = message.author ? ` from="${escapeAttribute(message.author)}"` : "";
      const via = message.via === "session" ? ` via="live session"` : "";
      return `<message${from}${via} at="${at(message.at)}">\n${escape(withPlainMentions(message.body).trim())}\n</message>`;
    })
    .join("\n");
}

export function formatComments(comments: TurnComment[]): string | undefined {
  if (comments.length === 0) return undefined;
  return (["research", "plan"] as const)
    .map((artifact) => {
      const listed = formatCommentsForAgent(comments.filter((entry) => entry.artifact === artifact).map((entry) => entry.comment));
      return listed ? `On the ${ARTIFACT_NAME[artifact]}:\n${escape(listed)}` : null;
    })
    .filter((section): section is string => section !== null)
    .join("\n\n");
}

export function formatEdits(edits: TurnEdit[]): string | undefined {
  if (edits.length === 0) return undefined;
  return edits
    .map((edit) => `<${edit.artifact} edited-by="${escapeAttribute(edit.by)}">\n${edit.content}\n</${edit.artifact}>`)
    .join("\n");
}

export function formatReviewComments(comments: PullRequestReviewComment[]): string | undefined {
  return comments.length > 0 ? formatPullRequestComments(comments) : undefined;
}
