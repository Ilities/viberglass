import type { Chat } from "chat";
import type { SlackHandlerServices } from "../types";
import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from "@viberglass/types";

const PHASE_LABEL: Record<string, string> = {
  [TICKET_WORKFLOW_PHASE.PLANNING]: "the plan",
  [TICKET_WORKFLOW_PHASE.EXECUTION]: "the build",
};

function nextPhase(mode: string): TicketWorkflowPhase | null {
  if (mode === "research") return TICKET_WORKFLOW_PHASE.PLANNING;
  if (mode === "planning") return TICKET_WORKFLOW_PHASE.EXECUTION;
  return null;
}

/** "Write the plan" / "Build it" under a finished step: asks the agent for the next one, as the Slack user. */
export function registerTicketNextStepActionHandler(
  bot: Chat,
  services: SlackHandlerServices,
): void {
  bot.onAction(["ticket_next_step"], async (event) => {
    if (!event.value) return;

    const thread = event.thread;
    const userName = event.user.fullName ?? event.user.userName;

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
        await thread.post(`_There's no next step after "${ticketMapping.mode}"._`);
      }
      return;
    }

    try {
      if (thread) {
        await thread.post(`_${userName} asked the agent for ${PHASE_LABEL[targetPhase] ?? targetPhase}…_`);
      }
      await services.advanceAndRunTicketJob({
        ticketId: ticketMapping.ticketId,
        clankerId: ticketMapping.clankerId,
        targetPhase,
        slackUserId: event.user.userId,
      });
    } catch (err) {
      if (thread) {
        await thread.post(
          `Error: ${err instanceof Error ? err.message : "Failed to ask for the next step"}`,
        );
      }
    }
  });
}
