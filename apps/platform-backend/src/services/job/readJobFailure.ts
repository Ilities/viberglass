import { isObjectRecord, type JobFailure, type JobFailureCategory } from "@viberglass/types";

const CATEGORIES: JobFailureCategory[] = ["setup", "agent", "platform"];

function isCategory(value: unknown): value is JobFailureCategory {
  return CATEGORIES.some((category) => category === value);
}

/**
 * Reads a failure stored in a job's result JSON. Failures recorded before
 * categories existed have no title or category and are returned without them.
 */
export function readJobFailure(value: unknown): JobFailure | null {
  if (!isObjectRecord(value)) return null;
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
