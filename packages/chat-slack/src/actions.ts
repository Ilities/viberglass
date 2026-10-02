import type { TaskTurnAction } from "@viberglass/types";

/** Most options of an agent's question shown as buttons. */
export const MAX_OPTION_BUTTONS = 5;

/**
 * Ids of the buttons posted in a task's thread. Slack wants each button in a
 * message to have its own id, so an agent's options are numbered.
 */
export const SLACK_ACTION = {
  ask: "task_ask",
  answers: Array.from({ length: MAX_OPTION_BUTTONS }, (_, index) => `question_answer_${index}`),
} as const;

/** A button asking the agent for a step of a task. */
export const askValue = (ticketId: string, action: TaskTurnAction) => `${ticketId}|${action}`;
/** A button answering the agent's question with one of its options. */
export const answerValue = (questionId: string, option: number) => `${questionId}|${option}`;

/** What a button's value carries: the task or question, then the action or option. */
export function parseButtonValue(value: string): [string, string] | null {
  const [id, choice] = value.split("|");
  return id && choice ? [id, choice] : null;
}
