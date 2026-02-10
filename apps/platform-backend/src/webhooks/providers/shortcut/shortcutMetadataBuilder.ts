import type { ParsedShortcutEvent } from './shortcutTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return value;
}

function extractRepositoryFromPayload(payload: Record<string, unknown>): string | undefined {
  const repository = getRecord(payload.repository);
  return toNonEmptyString(repository?.full_name);
}

function extractIssueNumber(payload: Record<string, unknown>): string | undefined {
  const issue = getRecord(payload.issue);
  const issueNumber = issue?.number;
  if (typeof issueNumber === 'number') {
    return issueNumber.toString();
  }

  const pullRequest = getRecord(payload.pull_request);
  const pullRequestNumber = pullRequest?.number;
  if (typeof pullRequestNumber === 'number') {
    return pullRequestNumber.toString();
  }

  if (typeof payload.issue_number === 'number' || typeof payload.issue_number === 'string') {
    return String(payload.issue_number);
  }

  return undefined;
}

function extractAction(payload: Record<string, unknown>): string | undefined {
  return toNonEmptyString(payload.action);
}

function extractSender(payload: Record<string, unknown>): string | undefined {
  const sender = getRecord(payload.sender);
  const senderLogin = toNonEmptyString(sender?.login);
  if (senderLogin) {
    return senderLogin;
  }

  const user = getRecord(payload.user);
  const userLogin = toNonEmptyString(user?.login);
  if (userLogin) {
    return userLogin;
  }
  const userName = toNonEmptyString(user?.name);
  if (userName) {
    return userName;
  }

  const actor = getRecord(payload.actor);
  const actorLogin = toNonEmptyString(actor?.login);
  if (actorLogin) {
    return actorLogin;
  }

  return toNonEmptyString(actor?.name);
}

function extractCommentId(payload: Record<string, unknown>): string | undefined {
  const comment = getRecord(payload.comment);
  if (typeof comment?.id === 'number' || typeof comment?.id === 'string') {
    return String(comment.id);
  }
  return undefined;
}

export function buildShortcutMetadata(
  payload: Record<string, unknown>,
): ParsedShortcutEvent['metadata'] {
  return {
    repositoryId: extractRepositoryFromPayload(payload),
    issueKey: extractIssueNumber(payload),
    commentId: extractCommentId(payload),
    action: extractAction(payload),
    sender: extractSender(payload),
  };
}
