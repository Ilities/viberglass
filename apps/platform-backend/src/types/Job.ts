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

// Job status type from database schema
export type JobStatus = "queued" | "active" | "completed" | "failed";
export interface JobClankerInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agent: string | null;
}

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  progress: unknown;
  lastHeartbeat: string | null;
  progressUpdates: Array<{
    step: string | null;
    message: string;
    details: unknown | null;
    createdAt: string;
  }>;
  logs: Array<{
    id: string;
    level: "info" | "warn" | "error" | "debug";
    message: string;
    source: string | null;
    createdAt: string;
  }>;
  data: {
    id: string;
    tenantId: string;
    repository: string | null;
    task: string | null;
    branch: string | null;
    baseBranch: string | null;
    context: unknown;
    settings: unknown;
    timestamp: number;
  };
  result: unknown;
  failedReason: string | null;
  createdAt: Date | null;
  processedAt: Date | null;
  finishedAt: Date | null;
  ticketId: string | null;
  ticket: {
    id: string | null;
    title: string | null;
    externalTicketId: string | null;
  } | null;
  clankerId: string | null;
  clanker: JobClankerInfo | null;
}
