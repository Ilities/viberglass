import path from "path";
import { HARNESS_CONFIG_FILE_TYPES } from "@viberglass/types";

const AGENTS_FILE = "AGENTS.md";

function normalizeSeparators(input: string): string {
  return input.replace(/\\/g, "/");
}

export function normalizeInstructionPath(input: string): string {
  const trimmed = input.trim();
  const withPosixSeparators = normalizeSeparators(trimmed);
  const normalized = path.posix.normalize(withPosixSeparators);

  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

export function isInstructionPathSafe(input: string): boolean {
  const normalized = normalizeInstructionPath(input);

  if (!normalized || normalized === "." || normalized === "..") {
    return false;
  }

  if (normalized.startsWith("/") || normalized.startsWith("../")) {
    return false;
  }

  if (normalized.includes("/../") || normalized.includes("/./")) {
    return false;
  }

  return true;
}

export function isAllowedInstructionPath(input: string): boolean {
  if (!isInstructionPathSafe(input)) {
    return false;
  }

  const normalized = normalizeInstructionPath(input);
  if (normalized === AGENTS_FILE) {
    return true;
  }

  return HARNESS_CONFIG_FILE_TYPES.includes(normalized);
}

export function instructionPathErrorMessage(input: string): string {
  const normalized = normalizeInstructionPath(input);
  return `Invalid instruction file path "${normalized || input}". Allowed paths: AGENTS.md and ${HARNESS_CONFIG_FILE_TYPES.join(", ")}.`;
}
