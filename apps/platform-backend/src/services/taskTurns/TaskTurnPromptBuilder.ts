import type { TaskTurnAction } from "@viberglass/types";
import { PromptTemplateDAO, PROMPT_TYPE, type PromptType } from "../../persistence/promptTemplate/PromptTemplateDAO";
import { PromptTemplateService } from "../PromptTemplateService";
import { formatComments, formatEdits, formatMessages, formatPeople, formatReviewComments } from "./formatTurnContext";
import type { TaskTurnContext } from "./taskTurnContext";

export interface PromptRenderer {
  render(type: PromptType, projectId: string, vars: Record<string, string | undefined>): Promise<string>;
}

export interface TurnPrompts {
  /** What's new since the agent's last turn, and what to do: enough for a session that continues. */
  prompt: string;
  /** The task so far, then the same: for a session that starts over. */
  coldStartPrompt: string;
}

const flag = (on: boolean): string | undefined => (on ? "yes" : undefined);

/**
 * Builds a turn's prompts from the `task_turn` template and its cold-start
 * preamble (`task_turn_cold_start`), both editable per space.
 */
export class TaskTurnPromptBuilder {
  constructor(private readonly renderer: PromptRenderer = new PromptTemplateService(new PromptTemplateDAO())) {}

  async build(projectId: string, context: TaskTurnContext, action: TaskTurnAction, allowCode: boolean): Promise<TurnPrompts> {
    const { documents, fresh, earlier, ticket } = context;
    const [prompt, preamble] = await Promise.all([
      this.renderer.render(PROMPT_TYPE.task_turn, projectId, {
        threadMessages: formatMessages(fresh.messages),
        newComments: formatComments(fresh.comments),
        editedArtifacts: formatEdits(fresh.edits),
        pullRequestComments: formatReviewComments(fresh.pullRequestComments),
        writePlan: flag(action === "plan" && !documents.plan),
        revisePlan: flag(action === "plan" && Boolean(documents.plan)),
        buildIt: flag(action === "code"),
        continuesPullRequest: flag(action === "code" && Boolean(ticket.pullRequestUrl)),
        pullRequestUrl: ticket.pullRequestUrl ?? undefined,
        reply: flag(action === "reply"),
        summarise: flag(action === "summarise"),
        allowCode: flag(allowCode),
      }),
      this.renderer.render(PROMPT_TYPE.task_turn_cold_start, projectId, {
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
        externalTicketId: ticket.externalTicketId ?? undefined,
        people: formatPeople(context.people),
        summaryDocument: context.summary || undefined,
        planDocument: documents.plan || undefined,
        pullRequestUrl: ticket.pullRequestUrl ?? undefined,
        earlierMessages: formatMessages(earlier.messages),
        earlierComments: formatComments(earlier.openComments),
      }),
    ]);
    return { prompt, coldStartPrompt: `${preamble}\n\n${prompt}` };
  }
}
