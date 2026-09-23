import type { ClankerStatus } from "@viberglass/types";

export interface ClankerStatusSnapshot {
  status: ClankerStatus;
  statusMessage: string | null;
}

/**
 * Decides what a runner's stored status should become after an availability
 * check, or null when it should stay as it is.
 *
 * A failed start keeps its real error (for example "connect ENOENT
 * /var/run/docker.sock") until the runner is actually available again or
 * someone starts it again. Replacing it with a generic availability message
 * such as "Docker image not configured" hides the cause.
 */
export function nextClankerStatus(
  current: ClankerStatusSnapshot,
  availability: ClankerStatusSnapshot,
): ClankerStatusSnapshot | null {
  if (current.status === "deploying") return null;
  if (current.status === "failed" && availability.status !== "active") return null;
  if (
    availability.status === current.status &&
    availability.statusMessage === current.statusMessage
  ) {
    return null;
  }
  return availability;
}
