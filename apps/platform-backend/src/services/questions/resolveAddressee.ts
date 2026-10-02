import type { TaskParticipant, TaskParticipantRole } from "@viberglass/types";

export interface Addressee {
  userId: string;
  name: string;
  /** How the agent named them: by role, by name, or nobody it could find, so the task's driver. */
  role: TaskParticipantRole | "person" | "driver";
}

const ROLE_WORDS: Record<string, TaskParticipantRole> = {
  requester: "requester",
  requestor: "requester",
  owner: "owner",
  reviewer: "reviewer",
  reviewers: "reviewer",
};

function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/^@/, "").replace(/^the\s+/, "");
}

function byRole(participants: TaskParticipant[], role: TaskParticipantRole): TaskParticipant | undefined {
  return participants.find((participant) => participant.role === role);
}

const firstName = (name: string) => name.toLowerCase().split(/\s+/)[0] ?? "";

/** By full name or email, else by a first name only one person on the task has. */
function byName(participants: TaskParticipant[], wanted: string): TaskParticipant | undefined {
  const exact = participants.find((p) => p.name.toLowerCase() === wanted || p.email.toLowerCase() === wanted);
  if (exact) return exact;
  const matches = participants.filter((p) => firstName(p.name) === firstName(wanted));
  return new Set(matches.map((p) => p.userId)).size === 1 ? matches[0] : undefined;
}

/**
 * Whom a question goes to: the person on the task the agent named, by role
 * or by name. When it named nobody it can find, the task's owner, else its
 * requester, else whoever opened the session.
 */
export function resolveAddressee(
  addressee: string | null,
  participants: TaskParticipant[],
  sessionCreator: { id: string; name: string } | null,
): Addressee | null {
  const as = (participant: TaskParticipant | undefined, role: Addressee["role"]): Addressee | null =>
    participant ? { userId: participant.userId, name: participant.name, role } : null;

  if (addressee) {
    const wanted = normalise(addressee);
    const role = ROLE_WORDS[wanted];
    const named = role ? as(byRole(participants, role), role) : as(byName(participants, wanted), "person");
    if (named) return named;
  }
  return (
    as(byRole(participants, "owner"), "driver") ??
    as(byRole(participants, "requester"), "driver") ??
    (sessionCreator ? { userId: sessionCreator.id, name: sessionCreator.name, role: "driver" } : null)
  );
}
