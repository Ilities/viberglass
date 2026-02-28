import type { AgentType } from "./clanker";

export type NativeAgentConfigFormat = "json" | "toml";

export type NativeAgentConfigSupportedAgent =
  | "codex"
  | "opencode"
  | "qwen-cli"
  | "gemini-cli";

export interface NativeAgentConfigDefinition {
  agent: NativeAgentConfigSupportedAgent;
  defaultPath: string;
  format: NativeAgentConfigFormat;
}

export interface NativeAgentConfigTemplateResponse {
  agent: NativeAgentConfigSupportedAgent;
  supported: true;
  defaultPath: string;
  format: NativeAgentConfigFormat;
  content: string;
  pathOverrideAllowed: true;
}

export const NATIVE_AGENT_CONFIG_DEFINITIONS: Record<
  NativeAgentConfigSupportedAgent,
  NativeAgentConfigDefinition
> = {
  codex: {
    agent: "codex",
    defaultPath: ".codex/config.toml",
    format: "toml",
  },
  opencode: {
    agent: "opencode",
    defaultPath: "opencode.json",
    format: "json",
  },
  "qwen-cli": {
    agent: "qwen-cli",
    defaultPath: ".qwen/settings.json",
    format: "json",
  },
  "gemini-cli": {
    agent: "gemini-cli",
    defaultPath: ".gemini/settings.json",
    format: "json",
  },
};

export function isSupportedNativeAgentConfigAgent(
  agent: AgentType | string | null | undefined,
): agent is NativeAgentConfigSupportedAgent {
  return (
    agent === "codex" ||
    agent === "opencode" ||
    agent === "qwen-cli" ||
    agent === "gemini-cli"
  );
}

export function getNativeAgentConfigDefinition(
  agent: AgentType | string | null | undefined,
): NativeAgentConfigDefinition | null {
  if (!isSupportedNativeAgentConfigAgent(agent)) {
    return null;
  }

  return NATIVE_AGENT_CONFIG_DEFINITIONS[agent];
}
