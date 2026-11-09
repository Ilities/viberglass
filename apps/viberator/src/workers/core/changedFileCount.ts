import type { JobResult } from "./types";

/** How many files the run changed: a Files run's from what its save found, which lists no paths, else its changed paths. */
export function changedFileCount(result: Pick<JobResult, "changedFiles" | "filesSnapshot">): number {
  if (!result.filesSnapshot) return result.changedFiles.length;
  const { added, changed, removed } = result.filesSnapshot.changes;
  return added + changed + removed;
}
