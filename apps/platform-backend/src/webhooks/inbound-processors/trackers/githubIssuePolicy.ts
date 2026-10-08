import type { Severity } from "@viberglass/types";
import { field, stringAt } from "./payloadFields";

/** The names of an issue's labels, lower-cased. */
export function githubLabels(issue: unknown): string[] {
  const labels = field(issue, "labels");
  if (!Array.isArray(labels)) return [];
  return labels.flatMap((label) => {
    const name = stringAt(label, "name")?.trim().toLowerCase();
    return name ? [name] : [];
  });
}

export function githubSeverity(labels: string[]): Severity {
  if (labels.some((label) => label.includes("critical") || label.includes("urgent"))) return "critical";
  if (labels.some((label) => label.includes("high") || label.includes("important"))) return "high";
  if (labels.some((label) => label.includes("medium"))) return "medium";
  return "low";
}
