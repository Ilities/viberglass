// ExecutionContext, ExecutionResult, and related types now live in agent-core.
export type {
  ExecutionContext,
  ExecutionResult,
  TestResult,
  SecretMetadata,
  TicketMediaContext,
  ResourceLimits,
  BaseAgentConfig,
} from "@viberglass/agent-core";

import type { ExecutionResult as ExecutionResultType, BaseAgentConfig } from "@viberglass/agent-core";

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
  agentName?: BaseAgentConfig["name"];
  preferredAgents?: BaseAgentConfig["name"][];
  costLimit?: number;
  timeLimit?: number;
  testingRequired: boolean;
  codingStandards?: string;
  excludeFiles?: string[];
}

export interface AgentExecution {
  id: string;
  agentName: string;
  startTime: Date;
  endTime?: Date;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  result?: ExecutionResultType;
  logs: string[];
  resourceUsage: ResourceUsage;
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
  agents: Record<string, BaseAgentConfig>;
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
