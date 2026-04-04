import path from "path";

const AGENTS_FILE = "AGENTS.md";
const SKILLS_PREFIX = "skills/";
const HARNESS_CONFIG_FILES = ["opencode.json"];

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

  if (HARNESS_CONFIG_FILES.includes(normalized)) {
    return true;
  }

  return normalized.startsWith(SKILLS_PREFIX) && normalized.endsWith(".md");
}

export function instructionPathErrorMessage(input: string): string {
  const normalized = normalizeInstructionPath(input);
  return `Invalid instruction file path "${normalized || input}". Allowed paths: AGENTS.md, opencode.json, and skills/**/*.md.`;
}
