import type { TaskTurnAction } from "@viberglass/types";

export type TurnDocument = "plan";

/**
 * The documents a turn may write as new versions. Agents rewrite the plan on
 * their own (it's in the repository), and a build's take on it isn't a plan
 * anyone asked for. A reply may revise it, when someone asked for that in the
 * thread.
 */
const ASKED_FOR: Record<TaskTurnAction, readonly TurnDocument[]> = {
  plan: ["plan"],
  code: [],
  reply: ["plan"],
  summarise: [],
};

export function documentsAskedFor(action: TaskTurnAction | null): readonly TurnDocument[] {
  return action ? ASKED_FOR[action] : ["plan"];
}
