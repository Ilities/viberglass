/**
 * The client's reply to an ACP `session/request_permission` request.
 *
 * Every tool call the agent asks about is approved: runs are confined to their
 * own worker. Harnesses name their options differently (OpenCode offers
 * "once", "always" and "reject"), so the option is picked by kind, not by id.
 */

export type RequestPermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

interface PermissionOption {
  optionId: string;
  kind: string;
}

const APPROVING_KINDS = ["allow_once", "allow_always"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPermissionOption(v: unknown): v is PermissionOption {
  return isRecord(v) && typeof v.optionId === "string" && typeof v.kind === "string";
}

export function approvePermissionRequest(params: unknown): { outcome: RequestPermissionOutcome } {
  const options =
    isRecord(params) && Array.isArray(params.options)
      ? params.options.filter(isPermissionOption)
      : [];

  for (const kind of APPROVING_KINDS) {
    const option = options.find((candidate) => candidate.kind === kind);
    if (option) return { outcome: { outcome: "selected", optionId: option.optionId } };
  }
  // Nothing to approve with; "cancelled" is the only other valid answer.
  return { outcome: { outcome: "cancelled" } };
}
