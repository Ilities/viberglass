import { PROMPT_TYPE } from "../../persistence/promptTemplate/PromptTemplateDAO";

type PromptType = (typeof PROMPT_TYPE)[keyof typeof PROMPT_TYPE];

/** Templates that render the person's message themselves, as `revisionMessage`. */
const TEMPLATES_WITH_MESSAGE: ReadonlySet<PromptType> = new Set([
  PROMPT_TYPE.ticket_research_revision_task,
  PROMPT_TYPE.ticket_planning_revision_task,
]);

/**
 * Makes sure the agent sees what the person wrote when opening a session.
 * Fresh research, planning and execution templates have no slot for it, so
 * it is appended after the rendered task.
 */
export function withOpeningMessage(
  taskType: PromptType,
  renderedTask: string,
  message: string,
): string {
  const trimmed = message.trim();
  if (!trimmed || TEMPLATES_WITH_MESSAGE.has(taskType)) return renderedTask;
  return `${renderedTask}\n\n<user-message>\n${trimmed}\n</user-message>`;
}
