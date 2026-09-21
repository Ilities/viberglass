import type { PlatformSessionEvent } from "./acp/types";
import type { AgentUsageReport } from "./usage";

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskSpaceMB: number;
  maxNetworkRequests: number;
}

export interface BaseAgentConfig extends Record<string, unknown> {
  name: string;
  apiKey?: string;
  endpoint?: string;
  capabilities: string[];
  costPerExecution: number;
  averageSuccessRate: number;
  executionTimeLimit: number;
  resourceLimits: ResourceLimits;
}

export interface SecretMetadata {
  id: string;
  name: string;
  secretLocation: "env" | "database" | "ssm";
  secretPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMediaContext {
  id: string;
  kind: "screenshot" | "recording";
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  storageUrl: string;
  mountPath?: string;
  s3Url?: string;
  accessUrl?: string;
}

export interface ExecutionContext {
  // Repository
  repoUrl: string;
  branch: string;
  baseBranch?: string;
  repoDir?: string;
  commitHash: string;

  // Bug information
  bugDescription: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;

  // Technical context
  stackTrace?: string;
  consoleErrors?: string[];
  affectedFiles?: string[];
  ticketMedia?: TicketMediaContext[];
  researchDocument?: string;
  planDocument?: string;

  // Constraints
  maxChanges: number;
  testRequired: boolean;
  codingStandards?: string;

  // CI/CD
  runTests: boolean;
  testCommand?: string;

  // Timeout
  maxExecutionTime: number;

  // Job metadata
  jobKind?: string;

  // Agent and secrets configuration
  agent?: string;
  secrets?: SecretMetadata[];
  promptOverride?: string;

  // ACP interactive session fields
  agentSessionId?: string;
  acpSessionId?: string;
  onAcpEvent?: (event: PlatformSessionEvent) => void;
}

export interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  errorMessage?: string;
}

export interface ExecutionResult {
  success: boolean;
  changedFiles: string[];
  commitHash?: string;
  pullRequestUrl?: string;
  testResults?: TestResult[];
  errorMessage?: string;
  executionTime: number;
  cost: number;
  acpTurnOutcome?: "completed" | "needs_input" | "needs_approval";
  newAcpSessionId?: string;
  /**
   * Token usage and cost as reported by the CLI itself.
   *
   * Distinct from `cost`, which falls back to the plugin's
   * `costPerExecution` constant. Undefined means the CLI reported nothing —
   * recorded as such rather than estimated. See {@link AgentUsageReport}.
   */
  usage?: AgentUsageReport;
  /**
   * SHA-256 of the fully assembled prompt, for the run manifest.
   *
   * The hash rather than the prompt: prompts embed ticket bodies from
   * untrusted webhook senders, and "was this the same prompt as last run" is
   * the question the manifest actually needs to answer.
   */
  promptHash?: string;
  promptCharacters?: number;
}

// Intermediate type for CLI results that may include optional cost.
// changedFiles is optional — BaseAgent.execute collects it via gitService after
// executeAgentCLI returns, so individual agents don't need to call getChangedFiles.
export type AgentCLIResult = Omit<ExecutionResult, "executionTime" | "cost" | "changedFiles"> & {
  cost?: number;
  changedFiles?: string[];
};
