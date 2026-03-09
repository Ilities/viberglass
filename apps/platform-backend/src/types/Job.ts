import type { JobKind, TicketSystem } from "@viberglass/types";

interface InstructionFile {
  fileType: string;
  content?: string;
  mountPath?: string;
}

export interface JobTicketMedia {
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

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readOnly?: boolean;
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

// Base job settings (shared across all job kinds)
export interface JobSettings {
  maxChanges?: number;
  testRequired?: boolean;
  codingStandards?: string;
  runTests?: boolean;
  testCommand?: string;
  maxExecutionTime?: number;
}

// Context types for each job kind
export interface BaseJobContext {
  instructionFiles?: InstructionFile[];
}

export interface TicketJobContext extends BaseJobContext {
  ticketId: string;
  originalTicketId?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  stackTrace?: string;
  consoleErrors?: string[];
  affectedFiles?: string[];
  ticketMedia?: JobTicketMedia[];
  researchDocument?: string;
  planDocument?: string;
}

export interface ResearchJobContext extends BaseJobContext {
  ticketId: string;
  researchDocument?: string;
}

export interface PlanningJobContext extends BaseJobContext {
  ticketId: string;
  planDocument?: string;
}

export interface ClawJobContext extends BaseJobContext {
  clawExecutionId: string;
  clawScheduleId: string;
  clawTemplateName: string;
}

export type JobContext =
  | { jobKind: 'execution'; context: TicketJobContext }
  | { jobKind: 'research'; context: ResearchJobContext }
  | { jobKind: 'planning'; context: PlanningJobContext }
  | { jobKind: 'claw'; context: ClawJobContext };

// Discriminated union for JobData based on jobKind
export interface BaseJobData {
  id: string;
  jobKind: JobKind;
  tenantId: string;
  repository: string;
  task: string;
  branch?: string;
  baseBranch?: string;
  settings?: JobSettings;
  overrides?: JobOverrides;
  scm?: JobScmConfig | null;
  /** Optional worker bootstrap payload persisted for ref-based invocation */
  bootstrapPayload?: Record<string, unknown>;
  /** Optional host->container mount bindings for Docker invocations */
  mounts?: VolumeMount[];
  timestamp: number;
  /** Callback token for authenticating worker callbacks (set after job creation) */
  callbackToken?: string;
}

export interface TicketJobData extends BaseJobData {
  jobKind: 'execution';
  context: TicketJobContext;
}

export interface ResearchJobData extends BaseJobData {
  jobKind: 'research';
  context: ResearchJobContext;
}

export interface PlanningJobData extends BaseJobData {
  jobKind: 'planning';
  context: PlanningJobContext;
}

export interface ClawJobData extends BaseJobData {
  jobKind: 'claw';
  context: ClawJobContext;
}

export type JobData =
  | TicketJobData
  | ResearchJobData
  | PlanningJobData
  | ClawJobData;

export interface JobResult {
  success: boolean;
  branch?: string;
  pullRequestUrl?: string;
  documentContent?: string;
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
  jobKind: JobKind;
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
    jobKind: JobKind;
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
