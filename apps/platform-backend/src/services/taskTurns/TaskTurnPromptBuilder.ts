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

/** An artifact of the task, as the agent revises it: by id. */
export interface TaskArtifactRef {
  id: string;
  title: string;
  entrypoint: string | null;
}

function formatArtifacts(artifacts: TaskArtifactRef[]): string {
  return artifacts
    .map((artifact) => `"${artifact.title}" (artifactId ${artifact.id}${artifact.entrypoint ? `, opens ${artifact.entrypoint}` : ""})`)
    .join("; ");
}

/**
 * Builds a turn's prompts from the `task_turn` template and its cold-start
 * preamble (`task_turn_cold_start`), both editable per space.
 */
export class TaskTurnPromptBuilder {
  constructor(private readonly renderer: PromptRenderer = new PromptTemplateService(new PromptTemplateDAO())) {}

  /**
   * `filesSpace`: the agent works in a Files space's shared files rather than a
   * repository, and a build makes an artifact; `artifacts` are the task's own.
   */
  async build(
    projectId: string,
    context: TaskTurnContext,
    action: TaskTurnAction,
    allowCode: boolean,
    filesSpace = false,
    artifacts: TaskArtifactRef[] = [],
  ): Promise<TurnPrompts> {
    const { documents, fresh, earlier, ticket } = context;
    const building = action === "code" && !filesSpace;
    const creatingArtifact = action === "code" && filesSpace;
    const [prompt, preamble] = await Promise.all([
      this.renderer.render(PROMPT_TYPE.task_turn, projectId, {
        threadMessages: formatMessages(fresh.messages),
        newComments: formatComments(fresh.comments),
        editedArtifacts: formatEdits(fresh.edits),
        pullRequestComments: formatReviewComments(fresh.pullRequestComments),
        writePlan: flag(action === "plan" && !documents.plan),
        revisePlan: flag(action === "plan" && Boolean(documents.plan)),
        // A reply may revise the plan too, so it's told which parts are built as well.
        builtParts: (action === "plan" && Boolean(documents.plan)) || action === "reply" ? (context.parts.built ?? undefined) : undefined,
        buildIt: flag(building),
        buildParts: building ? (context.parts.building ?? undefined) : undefined,
        addParts: building ? (context.parts.adding ?? undefined) : undefined,
        addedTo: building ? (context.parts.addedTo ?? undefined) : undefined,
        continuesPullRequest: flag(building && Boolean(ticket.pullRequestUrl)),
        createArtifact: flag(creatingArtifact),
        // A reply or plan in a Files space may make the deliverable too; only a build must.
        mayDeclareArtifact: flag(filesSpace && (action === "reply" || action === "plan")),
        taskArtifacts: filesSpace && action !== "summarise" && artifacts.length > 0 ? formatArtifacts(artifacts) : undefined,
        pullRequestUrl: ticket.pullRequestUrl ?? undefined,
        reply: flag(action === "reply"),
        summarise: flag(action === "summarise"),
        allowCode: flag(allowCode && !filesSpace),
        // Changes outside a build are thrown away in a repository; a Files space keeps them.
        discardCode: flag(!allowCode && !filesSpace),
        filesSpace: flag(filesSpace),
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
