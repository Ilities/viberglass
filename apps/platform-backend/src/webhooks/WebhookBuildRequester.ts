import logger from "../config/logger";
import type { TaskTurnService } from "../services/taskTurns/TaskTurnService";

/**
 * Asks the task's agent to build when a webhook set to build on its own
 * creates the task. The build is a turn in the task's thread like any other.
 */
export class WebhookBuildRequester {
  constructor(private readonly turns: Pick<TaskTurnService, "ask">) {}

  /**
   * The build's job, or undefined while it waits behind a running turn or
   * couldn't start. Never fails the delivery: the task exists by now, and a
   * retried delivery would create it again.
   */
  async request(ticketId: string): Promise<string | undefined> {
    try {
      const asked = await this.turns.ask(ticketId, null, { message: "", action: "code", fromWebhook: true });
      return asked.job.id ?? undefined;
    } catch (error) {
      logger.warn("Could not start the build a webhook asked for", {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }
}
