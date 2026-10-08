import { partRangeName, type PartRange, type TaskPlanParts } from "@viberglass/types";

function names(numbers: number[]): string {
  if (numbers.length === 1) return `Part ${numbers[0]}`;
  return `Parts ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** Whether a build of `buildParts` adds them to the open pull request, which built earlier parts first. */
export function addsToOpen(state: TaskPlanParts, buildParts: PartRange | null): boolean {
  const { open } = state;
  return Boolean(open && buildParts && buildParts.first > open.first && (open.last === null || (buildParts.last !== null && buildParts.last <= open.last)));
}

/**
 * What a turn's prompt says about the plan's parts: the parts a build covers
 * in a new pull request, by name ("part 2, “Print it on the slip”"), or adds
 * to the open one, with the parts it already builds, and the parts that
 * already have a pull request or were done another way ("Parts 1 and 2").
 */
export function describeTurnParts(
  state: TaskPlanParts,
  buildParts: PartRange | null,
): { building: string | null; adding: string | null; addedTo: string | null; built: string | null } {
  const built = state.parts.filter((part) => part.status !== "not_built" && part.status !== "skipped").map((part) => part.number);
  const single = buildParts && buildParts.last === buildParts.first ? state.parts.find((part) => part.number === buildParts.first) : undefined;
  const named = buildParts && state.parts.length > 1
    ? single?.title
      ? `${partRangeName(buildParts)}, “${single.title}”`
      : partRangeName(buildParts)
    : null;
  const adding = addsToOpen(state, buildParts) && state.open && buildParts ? named : null;
  const addedTo = adding && state.open && buildParts ? partRangeName({ first: state.open.first, last: buildParts.first - 1 }) : null;
  return {
    building: adding ? null : named,
    adding,
    addedTo,
    built: built.length > 0 && state.parts.length > 1 ? names(built) : null,
  };
}
