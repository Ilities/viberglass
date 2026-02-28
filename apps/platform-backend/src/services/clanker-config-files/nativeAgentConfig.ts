import type {
  AgentType,
  Clanker,
  ConfigFileInput,
  NativeAgentConfigTemplateResponse,
} from "@viberglass/types";
import {
  getNativeAgentConfigDefinition,
  isSupportedNativeAgentConfigAgent,
} from "@viberglass/types";
import { resolveClankerConfig } from "../../clanker-config";
import {
  classifyClankerConfigPath,
  instructionPathErrorMessage,
  nativeAgentConfigPathErrorMessage,
  normalizeInstructionPath,
  type ClankerConfigFileKind,
} from "../instructions/pathPolicy";
import { stringifyToml, validateToml } from "./toml";

export interface SplitClankerConfigFiles {
  instructionFiles: ConfigFileInput[];
  nativeAgentConfigFile: ConfigFileInput | null;
}

type TomlCompatibleValue =
  | string
  | number
  | boolean
  | TomlCompatibleValue[]
  | TomlCompatibleTable;

interface TomlCompatibleTable {
  [key: string]: TomlCompatibleValue;
}

function toTomlCompatibleValue(value: unknown): TomlCompatibleValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toTomlCompatibleValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object" && value !== null) {
    const nested: TomlCompatibleTable = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = toTomlCompatibleValue(entry);
      if (normalized !== undefined) {
        nested[key] = normalized;
      }
    }

    return nested;
  }

  return undefined;
}

function getAgentNativeConfigValues(
  clanker: Clanker | null | undefined,
): Record<string, unknown> {
  if (!clanker) {
    return {};
  }

  const resolved = resolveClankerConfig(clanker).config.agent;
  if (resolved.type === "codex") {
    return resolved.cli ? { ...resolved.cli } : {};
  }

  if (resolved.type === "qwen-cli") {
    return resolved.endpoint ? { endpoint: resolved.endpoint } : {};
  }

  if (resolved.type === "opencode") {
    return {
      ...(resolved.endpoint ? { endpoint: resolved.endpoint } : {}),
      ...(resolved.model ? { model: resolved.model } : {}),
    };
  }

  if (resolved.type === "gemini-cli") {
    return resolved.model ? { model: resolved.model } : {};
  }

  return {};
}

function stringifyNativeAgentConfig(
  agent: AgentType | string,
  values: Record<string, unknown>,
): string {
  if (agent === "codex") {
    const compatibleValues = toTomlCompatibleValue(values);
    const serialized =
      compatibleValues &&
      typeof compatibleValues === "object" &&
      !Array.isArray(compatibleValues)
        ? stringifyToml(compatibleValues)
        : "";
    return serialized || "# Add Codex CLI settings here";
  }

  const serialized = JSON.stringify(values, null, 2);
  return serialized === "{}" ? "{\n  \n}" : `${serialized}\n`;
}

function validateNativeAgentConfigContent(
  file: ConfigFileInput,
): void {
  if (file.fileType.endsWith(".json")) {
    JSON.parse(file.content);
    return;
  }

  validateToml(file.content);
}

function classifyFile(
  agent: AgentType | string | null | undefined,
  file: ConfigFileInput,
): ClankerConfigFileKind {
  const normalizedPath = normalizeInstructionPath(file.fileType);
  const kind = classifyClankerConfigPath(agent, normalizedPath);
  if (kind === "instruction") {
    return kind;
  }

  if (kind === "native-agent-config") {
    return kind;
  }

  if (normalizedPath.endsWith(".json") || normalizedPath.endsWith(".toml")) {
    throw new Error(nativeAgentConfigPathErrorMessage(agent, normalizedPath));
  }

  throw new Error(instructionPathErrorMessage(normalizedPath));
}

export function splitClankerConfigFiles(
  agent: AgentType | string | null | undefined,
  configFiles: ConfigFileInput[],
): SplitClankerConfigFiles {
  const instructionFiles: ConfigFileInput[] = [];
  let nativeAgentConfigFile: ConfigFileInput | null = null;

  for (const file of configFiles) {
    const normalizedPath = normalizeInstructionPath(file.fileType);
    const normalizedFile: ConfigFileInput = {
      fileType: normalizedPath,
      content: file.content,
    };

    const kind = classifyFile(agent, normalizedFile);
    if (kind === "instruction") {
      instructionFiles.push(normalizedFile);
      continue;
    }

    if (nativeAgentConfigFile) {
      throw new Error("Only one native agent config file is allowed per clanker.");
    }

    if (!isSupportedNativeAgentConfigAgent(agent)) {
      throw new Error(`Agent "${agent || "unknown"}" does not support native config files.`);
    }

    nativeAgentConfigFile = normalizedFile;
  }

  return { instructionFiles, nativeAgentConfigFile };
}

export function validateClankerConfigFiles(
  agent: AgentType | string | null | undefined,
  configFiles: ConfigFileInput[],
): SplitClankerConfigFiles {
  const split = splitClankerConfigFiles(agent, configFiles);

  if (!split.nativeAgentConfigFile) {
    return split;
  }

  if (!split.nativeAgentConfigFile.content.trim()) {
    throw new Error("Native agent config file content cannot be empty.");
  }

  validateNativeAgentConfigContent(split.nativeAgentConfigFile);
  return split;
}

export function buildNativeAgentConfigTemplate(
  agent: AgentType | string | null | undefined,
  clanker?: Clanker | null,
): NativeAgentConfigTemplateResponse | null {
  const definition = getNativeAgentConfigDefinition(agent);
  if (!definition) {
    return null;
  }

  const content = stringifyNativeAgentConfig(
    definition.agent,
    getAgentNativeConfigValues(clanker),
  );

  return {
    agent: definition.agent,
    supported: true,
    defaultPath: definition.defaultPath,
    format: definition.format,
    content,
    pathOverrideAllowed: true,
  };
}
