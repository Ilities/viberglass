import type { TaskTurnAction } from "@viberglass/types";

export type TurnDocument = "research" | "plan";

/**
 * The documents a turn may write as new versions. Agents rewrite the others
 * on their own (they're all in the repository), and a research turn's take on
 * the plan isn't a plan anyone asked for. A reply may revise either, when
 * someone asked for that in the thread.
 */
const ASKED_FOR: Record<TaskTurnAction, readonly TurnDocument[]> = {
  research: ["research"],
  plan: ["plan"],
  code: [],
  reply: ["research", "plan"],
  summarise: [],
};

export function documentsAskedFor(action: TaskTurnAction | null): readonly TurnDocument[] {
  return action ? ASKED_FOR[action] : ["research", "plan"];
}
