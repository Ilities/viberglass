import { BaseAgent } from "./BaseAgent";
import { ClaudeCodeAgent } from "./ClaudeCodeAgent";
import { QwenCodeAgent } from "./QwenCodeAgent";
import { CodexAgent } from "./CodexAgent";
import { MistralVibeAgent } from "./MistralVibeAgent";
import { GeminiCLIAgent } from "./GeminiCLIAgent";
import { AgentConfig } from "../types";
import { Logger } from "winston";

export class AgentFactory {
  static createAgent(config: AgentConfig, logger: Logger): BaseAgent {
    switch (config.name) {
      case "claude-code":
        return new ClaudeCodeAgent(config, logger);
      case "qwen-cli":
      case "qwen-api": // Support both CLI and API modes
        return new QwenCodeAgent(config, logger);
      case "codex":
        return new CodexAgent(config, logger);
      case "mistral-vibe":
        return new MistralVibeAgent(config, logger);
      case "gemini-cli":
        return new GeminiCLIAgent(config, logger);
      default:
        throw new Error(`Unknown agent type: ${(config as any).name}`);
    }
  }
}
