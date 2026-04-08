import type { Chat } from "chat";
import type { SlackHandlerServices } from "../types";
import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from "@viberglass/types";

const PHASE_LABEL: Record<string, string> = {
  [TICKET_WORKFLOW_PHASE.PLANNING]: "planning",
  [TICKET_WORKFLOW_PHASE.EXECUTION]: "execution",
};

function nextPhase(mode: string): TicketWorkflowPhase | null {
  if (mode === "research") return TICKET_WORKFLOW_PHASE.PLANNING;
  if (mode === "planning") return TICKET_WORKFLOW_PHASE.EXECUTION;
  return null;
}

export function registerTicketApprovalActionHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onAction(["ticket_approve_phase", "ticket_reject_phase"], async (event) => {
    const ticketId = event.value;
    if (!ticketId) return;

    const thread = event.thread;
    const approved = event.actionId === "ticket_approve_phase";
    const userName = event.user.fullName ?? event.user.userName;

    if (!approved) {
      if (thread) {
        await thread.post(
          `_Rejected by ${userName}. Mention @viberator with feedback to revise._`,
        );
      }
      return;
    }

    // Resolve current mode from the thread mapping
    const ticketMapping = thread ? await services.getTicketForThread(thread.id) : undefined;
    if (!ticketMapping) {
      if (thread) {
        await thread.post("_Could not find ticket for this thread. Please use keyword commands instead._");
      }
      return;
    }

    const targetPhase = nextPhase(ticketMapping.mode);
    if (!targetPhase) {
      if (thread) {
        await thread.post(`_Cannot advance from phase "${ticketMapping.mode}" via approve button._`);
      }
      return;
    }

    const label = PHASE_LABEL[targetPhase] ?? targetPhase;

    try {
      if (thread) {
        await thread.post(`_Advancing to ${label} (approved by ${userName})…_`);
      }
      await services.advanceAndRunTicketJob({
        ticketId: ticketMapping.ticketId,
        clankerId: ticketMapping.clankerId,
        targetPhase,
      });
    } catch (err) {
      if (thread) {
        await thread.post(
          `Error: ${err instanceof Error ? err.message : "Failed to advance phase"}`,
        );
      }
    }
  });
}
