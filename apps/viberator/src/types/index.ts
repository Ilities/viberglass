import { AgentConfig } from "./agents";
import type { PlatformSessionEvent } from "../acp/types";

export * from "./agents";

// Core types for the AI Agent Orchestrator
export interface BugReport {
  id: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  stackTrace?: string;
  consoleErrors?: string[];
  affectedFiles?: string[];
  severity: "low" | "medium" | "high" | "critical";
  language: string;
  framework?: string;
}

export interface Ticket {
  id: string;
  priority: "low" | "medium" | "high" | "urgent";
  assignee?: string;
  labels: string[];
  createdAt: Date;
  updatedAt: Date;
  estimatedEffort?: number; // hours
}

export interface ProjectSettings {
  repoUrl: string;
  branch: string;
  agentName?: AgentConfig["name"];
  preferredAgents?: AgentConfig["name"][];
  costLimit?: number;
  timeLimit?: number;
  testingRequired: boolean;
  codingStandards?: string;
  excludeFiles?: string[];
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
  maxExecutionTime: number; // 30-45 minutes

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

export interface AgentExecution {
  id: string;
  agentName: string;
  startTime: Date;
  endTime?: Date;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  result?: ExecutionResult;
  logs: string[];
  resourceUsage: ResourceUsage;
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
}

export interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  errorMessage?: string;
}

export interface ResourceUsage {
  memoryUsed: number;
  cpuTime: number;
  networkRequests: number;
  diskSpaceUsed: number;
}

export interface GitConfig {
  userName: string;
  userEmail: string;
}

export interface Configuration {
  agents: Record<string, AgentConfig>;
  aws?: {
    region: string;
    ssmParameterPath: string;
  };
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "json" | "text";
  };
  execution: {
    maxConcurrentJobs: number;
    defaultTimeout: number;
    retryAttempts: number;
  };
  git?: GitConfig;
}
