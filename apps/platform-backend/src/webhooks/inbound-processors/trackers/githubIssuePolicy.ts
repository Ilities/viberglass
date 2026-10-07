import { isObjectRecord, type Severity } from "@viberglass/types";
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

/**
 * Whether a new issue gets its plan written: every issue when the connection
 * plans new issues, or with label gating, only issues with one of its labels.
 */
export function plansGitHubIssue(planNewIssues: boolean, labelMappings: Record<string, unknown>, labels: string[]): boolean {
  if (!planNewIssues) return false;
  const nested = labelMappings.github;
  const policy = isObjectRecord(nested) ? nested : labelMappings;
  const mode = (stringAt(policy, "planNewIssuesMode") ?? stringAt(policy, "mode"))?.trim().toLowerCase();
  if (mode !== "label_gated") return true;
  const required = field(policy, "requiredLabels") ?? field(policy, "labels");
  const wanted = Array.isArray(required) ? required.flatMap((label) => (typeof label === "string" && label.trim() ? [label.trim().toLowerCase()] : [])) : [];
  return wanted.some((label) => labels.includes(label));
}
