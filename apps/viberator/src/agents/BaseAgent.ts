// Re-export the framework base class and shared types from agent-core.
// Concrete agents in this package extend ViberatorBaseAgent (which injects GitService).
export { BaseAgent } from "@viberglass/agent-core";
export type { AgentCLIResult } from "@viberglass/agent-core";
