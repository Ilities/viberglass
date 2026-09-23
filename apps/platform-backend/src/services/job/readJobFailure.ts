import type { JobFailure, JobFailureCategory } from "@viberglass/types";

const CATEGORIES: JobFailureCategory[] = ["setup", "agent", "platform"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCategory(value: unknown): value is JobFailureCategory {
  return CATEGORIES.some((category) => category === value);
}

/**
 * Reads a failure stored in a job's result JSON. Failures recorded before
 * categories existed have no title or category and are returned without them.
 */
export function readJobFailure(value: unknown): JobFailure | null {
  if (!isRecord(value)) return null;
  const { code, summary, title, category, technicalDetail, retryable } = value;
  if (typeof code !== "string" || typeof summary !== "string") return null;
  return {
    code,
    summary,
    retryable: retryable === true,
    ...(typeof title === "string" ? { title } : {}),
    ...(isCategory(category) ? { category } : {}),
    ...(typeof technicalDetail === "string" ? { technicalDetail } : {}),
  };
}
