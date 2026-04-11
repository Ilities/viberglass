import { AgentRegistry } from "@viberglass/agent-core";
import claudeCodePlugin from "@viberglass/agent-claude-code";
import qwenCodePlugin from "@viberglass/agent-qwen";
import codexPlugin from "@viberglass/agent-codex";
import openCodePlugin from "@viberglass/agent-opencode";
import kimiCodePlugin from "@viberglass/agent-kimi";
import mistralVibePlugin from "@viberglass/agent-mistral-vibe";
import geminiCLIPlugin from "@viberglass/agent-gemini";
import piPlugin from "@viberglass/agent-pi";

export function buildAgentRegistry(): AgentRegistry {
  return new AgentRegistry()
    .register(claudeCodePlugin)
    .register(qwenCodePlugin)
    .register(codexPlugin)
    .register(openCodePlugin)
    .register(kimiCodePlugin)
    .register(mistralVibePlugin)
    .register(geminiCLIPlugin)
    .register(piPlugin);
}

// Singleton for places that can't easily receive a reference
let _registry: AgentRegistry | null = null;
export function agentRegistry(): AgentRegistry {
  if (!_registry) _registry = buildAgentRegistry();
  return _registry;
}
