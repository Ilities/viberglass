// Core types for the AI Agent Orchestrator

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskSpaceMB: number;
  maxNetworkRequests: number;
}

export interface AgentConfig {
  name:
    | "claude-code"
    | "qwen-cli"
    | "qwen-api"
    | "codex"
    | "mistral-vibe"
    | "gemini-cli";
  capabilities: string[]; // ['python', 'javascript', 'java', 'typescript', 'go', 'rust']
  costPerExecution: number;
  averageSuccessRate: number;
  executionTimeLimit: number; // seconds
  resourceLimits: ResourceLimits;
  apiKey?: string;
  endpoint?: string;
  maxTokens?: number;
  temperature?: number;
}

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
  preferredAgents?: string[];
  costLimit?: number;
  timeLimit?: number;
  testingRequired: boolean;
  codingStandards?: string;
  excludeFiles?: string[];
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

  // Constraints
  maxChanges: number;
  testRequired: boolean;
  codingStandards?: string;

  // CI/CD
  runTests: boolean;
  testCommand?: string;

  // Timeout
  maxExecutionTime: number; // 30-45 minutes
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
}
