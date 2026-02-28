import path from "path";
import {
  getNativeAgentConfigDefinition,
  isSupportedNativeAgentConfigAgent,
  type AgentType,
} from "@viberglass/types";

const AGENTS_FILE = "AGENTS.md";
const SKILLS_PREFIX = "skills/";

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

  return normalized.startsWith(SKILLS_PREFIX) && normalized.endsWith(".md");
}

function getExpectedNativeAgentConfigExtension(
  agent: AgentType | string | null | undefined,
): string | null {
  const definition = getNativeAgentConfigDefinition(agent);
  if (!definition) {
    return null;
  }

  return definition.format === "toml" ? ".toml" : ".json";
}

function matchesNativeAgentConfigPathShape(
  agent: AgentType | string | null | undefined,
  normalizedPath: string,
): boolean {
  const definition = getNativeAgentConfigDefinition(agent);
  if (!definition) {
    return false;
  }

  if (definition.agent === "opencode") {
    return normalizedPath.endsWith(".json");
  }

  return (
    normalizedPath === definition.defaultPath ||
    normalizedPath.endsWith(`/${definition.defaultPath}`)
  );
}

export function isAllowedNativeAgentConfigPath(
  agent: AgentType | string | null | undefined,
  input: string,
): boolean {
  if (!isSupportedNativeAgentConfigAgent(agent)) {
    return false;
  }

  if (!isInstructionPathSafe(input)) {
    return false;
  }

  const normalized = normalizeInstructionPath(input);
  if (!normalized || isAllowedInstructionPath(normalized)) {
    return false;
  }

  const expectedExtension = getExpectedNativeAgentConfigExtension(agent);
  return expectedExtension
    ? normalized.endsWith(expectedExtension) &&
        matchesNativeAgentConfigPathShape(agent, normalized)
    : false;
}

export type ClankerConfigFileKind = "instruction" | "native-agent-config";

export function classifyClankerConfigPath(
  agent: AgentType | string | null | undefined,
  input: string,
): ClankerConfigFileKind | null {
  if (isAllowedInstructionPath(input)) {
    return "instruction";
  }

  if (isAllowedNativeAgentConfigPath(agent, input)) {
    return "native-agent-config";
  }

  return null;
}

export function instructionPathErrorMessage(input: string): string {
  const normalized = normalizeInstructionPath(input);
  return `Invalid instruction file path "${normalized || input}". Allowed paths: AGENTS.md and skills/**/*.md.`;
}

export function nativeAgentConfigPathErrorMessage(
  agent: AgentType | string | null | undefined,
  input: string,
): string {
  const normalized = normalizeInstructionPath(input);
  const definition = getNativeAgentConfigDefinition(agent);
  if (!definition) {
    return `Agent "${agent || "unknown"}" does not support native config files.`;
  }

  return `Invalid native config file path "${normalized || input}". Use a safe relative path ending in ${
    definition.format === "toml" ? ".toml" : ".json"
  }${
    definition.agent === "opencode"
      ? ""
      : ` at ${definition.defaultPath} or under a parent directory ending with /${definition.defaultPath}`
  }.`;
}
