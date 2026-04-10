import { BaseAgent } from "@viberglass/agent-core";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";
import { QwenCodeAgent } from "./QwenCodeAgent";
import { CodexAgent } from "./CodexAgent";
import { OpenCodeAgent } from "./OpenCodeAgent";
import { KimiCodeAgent } from "./KimiCodeAgent";
import { MistralVibeAgent } from "./MistralVibeAgent";
import { GeminiCLIAgent } from "./GeminiCLIAgent";
import { PiCodingAgent } from "./PiCodingAgent";
import { AgentConfig } from "../types";
import { Logger } from "winston";

export class AgentFactory {
  static createAgent(config: AgentConfig, logger: Logger): BaseAgent {
    switch (config.name) {
      case "claude-code":
        return new ClaudeCodeAgent(config, logger);
      case "qwen-cli":
        return new QwenCodeAgent(config, logger);
      case "codex":
        return new CodexAgent(config, logger);
      case "opencode":
        return new OpenCodeAgent(config, logger);
      case "kimi-code":
        return new KimiCodeAgent(config, logger);
      case "mistral-vibe":
        return new MistralVibeAgent(config, logger);
      case "gemini-cli":
        return new GeminiCLIAgent(config, logger);
      case "pi":
        return new PiCodingAgent(config, logger);
      default:
        throw new Error(`Unknown agent type: ${(config as any).name}`);
    }
  }
}
