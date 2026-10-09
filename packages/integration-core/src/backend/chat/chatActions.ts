import { isTaskTurnAction, type PartRange, type TaskTurnAction } from '@viberglass/types'

/** Most options of an agent's question shown as buttons. */
export const MAX_OPTION_BUTTONS = 5;

/**
 * Ids of the buttons posted in a task's thread. Some chat services want each
 * button in a message to have its own id, so an agent's options are numbered.
 */
export const CHAT_ACTION = {
  ask: "task_ask",
  answers: Array.from({ length: MAX_OPTION_BUTTONS }, (_, index) => `question_answer_${index}`),
} as const;

/** A button asking the agent for a step of a task, for a build maybe of some of the plan's parts. */
export const askValue = (ticketId: string, action: TaskTurnAction, parts?: PartRange) =>
  parts ? `${ticketId}|${action}|${parts.first}-${parts.last ?? ""}` : `${ticketId}|${action}`;
/** A button answering the agent's question with one of its options. */
export const answerValue = (questionId: string, option: number) => `${questionId}|${option}`;

/** What a button's value carries: the task or question, then the action or option. */
export function parseButtonValue(value: string): [string, string] | null {
  const [id, choice] = value.split("|");
  return id && choice ? [id, choice] : null;
}

/** An ask button's task, action, and the parts it builds, if it names them. */
export function parseAskValue(value: string): { ticketId: string; action: TaskTurnAction; parts?: PartRange } | null {
  const [ticketId, action, range] = value.split("|");
  if (!ticketId || !isTaskTurnAction(action)) return null;
  const [first, last] = (range ?? "").split("-");
  const parts = first ? { first: Number(first), last: last ? Number(last) : null } : undefined;
  if (parts && (!Number.isInteger(parts.first) || (parts.last !== null && !Number.isInteger(parts.last)))) return null;
  return { ticketId, action, ...(parts ? { parts } : {}) };
}
