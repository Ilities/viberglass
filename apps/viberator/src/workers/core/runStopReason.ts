/**
 * Why the run ended, for its record: the agent's own stop reason when it got
 * that far, otherwise the job's outcome, since a run can fail during clone
 * without reaching the agent. A run that failed after its agent completed,
 * pushing its branch or saving its files, failed; it didn't complete.
 */
export function runStopReason(agentStopReason: string | undefined, success: boolean): string {
  if (success) return agentStopReason ?? "completed";
  return agentStopReason && agentStopReason !== "completed" ? agentStopReason : "failed";
}
