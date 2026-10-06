import { partRangeName, type PartRange, type TaskPlanParts } from "@viberglass/types";

function names(numbers: number[]): string {
  if (numbers.length === 1) return `Part ${numbers[0]}`;
  return `Parts ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/**
 * What a turn's prompt says about the plan's parts: the parts a build covers
 * in a new pull request, by name ("part 2, “Print it on the slip”"), and the
 * parts that already have a pull request ("Parts 1 and 2").
 */
export function describeTurnParts(state: TaskPlanParts, buildParts: PartRange | null): { building: string | null; built: string | null } {
  const built = state.parts.filter((part) => part.status !== "not_built").map((part) => part.number);
  const single = buildParts && buildParts.last === buildParts.first ? state.parts.find((part) => part.number === buildParts.first) : undefined;
  const building = buildParts && state.parts.length > 1
    ? single?.title
      ? `${partRangeName(buildParts)}, “${single.title}”`
      : partRangeName(buildParts)
    : null;
  return { building, built: built.length > 0 && state.parts.length > 1 ? names(built) : null };
}
