import { isObjectRecord } from "@viberglass/types";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (isObjectRecord(error) && typeof error.message === "string") {
    const normalized = error.message.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  return fallback;
}

export function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error && error.name.trim().length > 0) {
    return error.name;
  }

  if (isObjectRecord(error) && typeof error.name === "string") {
    const normalized = error.name.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
}

export function getNumericErrorCode(
  error: unknown,
  fieldName: string,
): number | undefined {
  if (!isObjectRecord(error)) {
    return undefined;
  }

  const value = error[fieldName];
  return typeof value === "number" ? value : undefined;
}
