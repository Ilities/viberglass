import type { BaseAgentConfig } from "@viberglass/agent-core";

// Mistral Vibe configuration
// Docs: https://docs.mistral.ai/api and https://github.com/mistralai/mistral-vibe
export interface MistralVibeConfig extends BaseAgentConfig {
  name: "mistral-vibe";
  apiKey: string; // MISTRAL_API_KEY
  endpoint?: "https://api.mistral.ai" | "https://codestral.mistral.ai" | string;
  model?:
    | "devstral-2" // 123B parameters, free
    | "devstral-small-2" // 24B parameters
    | "codestral-25.01" // 22B, 86.6% HumanEval
    | "mistral-medium-latest"
    | "mistral-small-latest"
    | string;
  maxTokens?: number;
  temperature?: number; // 0.0-2.0
  topP?: number; // 0.0-1.0
  safePrompt?: boolean; // Content filtering
  randomSeed?: number; // For deterministic outputs
  frequencyPenalty?: number; // Reduce repetition
  presencePenalty?: number; // Encourage diversity
  stopTokens?: string[]; // e.g., ['```'] to end at code blocks
  autoApprove?: boolean; // Auto-approve tool execution in CLI
}
