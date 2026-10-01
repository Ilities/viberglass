import type { PullRequestReviewComment } from "@viberglass/types";

/**
 * Open review comments on a task's pull request, as the agent reads them.
 *
 * Comments are untrusted text from outside the prompt, so angle brackets are
 * escaped: a comment cannot close its tag and write instructions of its own.
 */
export function formatPullRequestComments(comments: PullRequestReviewComment[]): string {
  return comments.map(formatComment).join("\n");
}

function formatComment(comment: PullRequestReviewComment): string {
  const attributes = [
    `kind="${comment.kind}"`,
    comment.author ? `author="${escapeAttribute(comment.author)}"` : null,
    comment.path ? `path="${escapeAttribute(comment.path)}"` : null,
    comment.line !== null ? `line="${comment.line}"` : null,
  ].filter((attribute) => attribute !== null);
  return `<comment ${attributes.join(" ")}>\n${escape(comment.body)}\n</comment>`;
}

function escape(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(text: string): string {
  return escape(text).replace(/"/g, "&quot;");
}
