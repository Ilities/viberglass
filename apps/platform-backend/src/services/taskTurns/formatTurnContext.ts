import { withPlainMentions, type PullRequestReviewComment } from "@viberglass/types";
import { formatCommentsForAgent } from "../comments/formatCommentsForAgent";
import { formatPullRequestComments } from "../pull-request-reviews/formatPullRequestComments";
import type { TurnComment, TurnEdit, TurnMessage, TurnPerson } from "./taskTurnContext";

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
      const answers = message.inAnswerTo ? ` in-answer-to="${escapeAttribute(message.inAnswerTo.replace(/\s+/g, " ").trim())}"` : "";
      return `<message${from}${via}${answers} at="${at(message.at)}">\n${escape(withPlainMentions(message.body).trim())}\n</message>`;
    })
    .join("\n");
}

export function formatPeople(people: TurnPerson[]): string | undefined {
  if (people.length === 0) return undefined;
  return people.map((person) => `- ${escape(person.name)}: ${person.roles.join(", ")}`).join("\n");
}

export function formatComments(comments: TurnComment[]): string | undefined {
  if (comments.length === 0) return undefined;
  const listed = formatCommentsForAgent(comments.map((entry) => entry.comment));
  return listed ? `On the plan:\n${escape(listed)}` : undefined;
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
