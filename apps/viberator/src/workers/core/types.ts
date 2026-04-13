// ============================================================================
// Worker Payload Types
// ============================================================================
// Type-specific payload interfaces for worker configuration at invocation time.
// Workers receive their complete configuration via payload, including clanker
// metadata, credential variable names, and references to instruction files.
// ============================================================================

/**
 * Project configuration passed to workers
 * Contains project-level settings for worker execution
 */
export interface ProjectConfigPayload {
  id: string;
  name: string;
  autoFixTags: string[];
  customFieldMappings: Record<string, string>;
  workerSettings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
}

/**
 * Override configuration for per-ticket/enhance screen overrides
 * Highest precedence in configuration hierarchy
 */
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

export interface ScmPayload {
  integrationId: string;
  integrationSystem?: string;
  sourceRepository: string;
  baseBranch: string;
  pullRequestRepository: string;
  pullRequestBaseBranch: string;
  branchNameTemplate?: string | null;
  credentialSecretId?: string | null;
  /** Resolved secret name — worker looks this up in fetchedCredentials to get the token value */
  credentialSecretName?: string | null;
}

export interface TicketMediaPayload {
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

/**
 * Shared fields across all worker payload types
 */
export interface BaseWorkerPayload {
  jobKind: JobKind;
  tenantId: string;
  jobId: string;
  clankerId: string;
  /** Platform API base URL used for callbacks/bootstrap requests */
  platformApiUrl?: string;
  agent?: string;
  repository: string;
  task: string;
  branch?: string;
  baseBranch?: string;
  context?: {
    ticketId?: string;
    originalTicketId?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    stackTrace?: string;
    consoleErrors?: string[];
    affectedFiles?: string[];
    researchDocument?: string;
    planDocument?: string;
    ticketMedia?: TicketMediaPayload[];
    instructionFiles?: Array<{ fileType: string; content: string }>;
  };
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
  projectConfig?: ProjectConfigPayload;
  overrides?: JobOverrides;
  scm?: ScmPayload | null;
  /** Callback token for authenticating worker callbacks to the platform */
  callbackToken?: string;
  /**
   * ACP session fields — present only on interactive (multi-turn) jobs.
   * Absent for one-shot jobs; workers must treat null/undefined as one-shot mode.
   */
  /** Platform session UUID linking this job to an agent_sessions row */
  agentSessionId?: string;
  /** Platform turn UUID linking this job to an agent_turns row */
  agentTurnId?: string;
  /** Session mode driving prompt assembly and artifact handling */
  sessionMode?: "research" | "planning" | "execution";
  /** CLI's own ACP session ID (sess_abc123) — used to call session/load on resume */
  acpSessionId?: string;
  /** S3 URL of conversation state archive to restore before CLI launch */
  conversationStateUrl?: string;
}

/**
 * Instruction file reference for AWS workers (Lambda/ECS)
 * Files are usually fetched from S3 using platform credentials,
 * but can also be provided inline.
 */
export interface S3InstructionFile {
  fileType: string; // e.g., 'AGENTS.md', 'skills/code-review.md'
  s3Url?: string; // s3://bucket/key format
  content?: string; // inline content override
}

/**
 * Instruction file reference for Docker workers
 * Files are mounted as volumes at container start
 */
export interface MountedInstructionFile {
  fileType: string;
  mountPath: string; // e.g., /etc/viberator/config/AGENTS.md
  content?: string; // inline override content
}

/**
 * Lambda worker payload
 * AWS Lambda functions receive S3 URLs for instruction files
 * and fetch them at runtime using platform credentials
 */
export interface LambdaPayload extends BaseWorkerPayload {
  workerType: "lambda";
  instructionFiles: S3InstructionFile[];
  requiredCredentials: string[]; // e.g., ['GITHUB_TOKEN', 'CLAUDE_API_KEY']
  deploymentConfig?: Record<string, unknown>;
}

/**
 * ECS worker payload
 * ECS tasks receive S3 URLs for instruction files
 * and fetch them at runtime using platform credentials
 */
export interface EcsPayload extends BaseWorkerPayload {
  workerType: "ecs";
  instructionFiles: S3InstructionFile[];
  requiredCredentials: string[];
  deploymentConfig?: Record<string, unknown>;
}

/**
 * Docker worker payload
 * Docker containers receive mount paths for instruction files
 * (mounted as volumes at container start)
 * Credentials passed via environment variables at docker run time
 */
export interface DockerPayload extends BaseWorkerPayload {
  workerType: "docker";
  instructionFiles: MountedInstructionFile[];
  requiredCredentials: string[];
  clankerConfig?: Record<string, unknown>; // Full config for Docker
}

/**
 * Union type for all worker payloads
 * Use workerType field for type discrimination
 */
export type WorkerPayload = LambdaPayload | EcsPayload | DockerPayload;

// ============================================================================
// Legacy Job Types (retained for compatibility)
// ============================================================================

export interface CodingJobData {
  id: string;
  jobKind: JobKind;
  tenantId: string;
  repository: string;
  task: string;
  branch?: string;
  baseBranch?: string;
  context?: {
    ticketId?: string;
    originalTicketId?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    stackTrace?: string;
    consoleErrors?: string[];
    affectedFiles?: string[];
    researchDocument?: string;
    planDocument?: string;
    ticketMedia?: TicketMediaPayload[];
    instructionFiles?: Array<{ fileType: string; content: string }>;
  };
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
  scm?: ScmPayload | null;
  timestamp: number;
}

export interface JobResult {
  success: boolean;
  branch?: string;
  pullRequestUrl?: string;
  documentContent?: string;
  changedFiles: string[];
  executionTime: number;
  errorMessage?: string;
  commitHash?: string;
  /** S3 URL of the uploaded conversation state archive (for session turns) */
  conversationStateUrl?: string;
}
import type { JobKind } from "@viberglass/types";
