export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  return isObjectRecord(value) ? value : undefined;
}

export function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toStringRecord(
  value: unknown,
  options?: { trimValues?: boolean; omitEmpty?: boolean },
): Record<string, string> | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const trimValues = options?.trimValues ?? false;
  const omitEmpty = options?.omitEmpty ?? false;
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = trimValues ? entry.trim() : entry;
    if (omitEmpty && normalized.length === 0) {
      continue;
    }
    result[key] = normalized;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function toStringArray(
  value: unknown,
  options?: { trimValues?: boolean; omitEmpty?: boolean },
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const trimValues = options?.trimValues ?? false;
  const omitEmpty = options?.omitEmpty ?? false;

  const entries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => (trimValues ? entry.trim() : entry))
    .filter((entry) => (!omitEmpty ? true : entry.length > 0));

  return entries.length > 0 ? entries : undefined;
}
