import type { TicketSystem } from "@viberglass/types";

interface InstructionFile {
  fileType: string;
  content?: string;
  mountPath?: string;
}

export interface JobScmConfig {
  integrationId: string;
  integrationSystem?: TicketSystem;
  sourceRepository: string;
  baseBranch: string;
  pullRequestRepository: string;
  pullRequestBaseBranch: string;
  branchNameTemplate?: string | null;
  credentialSecretId?: string | null;
}

// Override configuration for per-ticket/enhance screen overrides
export interface JobOverrides {
  additionalContext?: string;
  reproductionSteps?: string;
  expectedBehavior?: string;
  priorityOverride?: "critical" | "high" | "medium" | "low";
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
}

export interface JobData {
  id: string;
  tenantId: string;
  repository: string;
  task: string;
  branch?: string;
  baseBranch?: string;
  context?: {
    ticketId?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    stackTrace?: string;
    consoleErrors?: string[];
    affectedFiles?: string[];
    instructionFiles?: InstructionFile[];
  };
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
  overrides?: JobOverrides;
  scm?: JobScmConfig | null;
  /** Optional worker bootstrap payload persisted for ref-based invocation */
  bootstrapPayload?: Record<string, unknown>;
  timestamp: number;
  /** Callback token for authenticating worker callbacks (set after job creation) */
  callbackToken?: string;
}

export interface JobResult {
  success: boolean;
  branch?: string;
  pullRequestUrl?: string;
  changedFiles: string[];
  executionTime: number;
  errorMessage?: string;
  commitHash?: string;
}
