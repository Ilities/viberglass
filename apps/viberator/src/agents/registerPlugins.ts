import { AgentRegistry } from "@viberglass/agent-core";
import { configuredAgentPlugins } from "./configuredAgentPlugins";

export function buildAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  for (const plugin of configuredAgentPlugins) registry.register(plugin);
  return registry;
}

// Singleton for places that can't easily receive a reference
let _registry: AgentRegistry | null = null;
export function agentRegistry(): AgentRegistry {
  if (!_registry) _registry = buildAgentRegistry();
  return _registry;
}
