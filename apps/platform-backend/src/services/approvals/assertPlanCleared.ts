import { TICKET_SERVICE_ERROR_CODE, TicketServiceError } from "../errors/TicketServiceError";

/**
 * A build, run or live session, starts only once the plan is approved, or
 * someone allowed to approve it skipped to the build.
 */
export function assertPlanCleared(plan: { approvalState: string }, ticket: { workflowOverriddenAt?: string | null }): void {
  if (plan.approvalState === "approved" || ticket.workflowOverriddenAt) return;
  throw new TicketServiceError(
    TICKET_SERVICE_ERROR_CODE.EXECUTION_BLOCKED_UNAPPROVED_PLAN,
    "Execution is blocked until the planning document is approved",
  );
}
