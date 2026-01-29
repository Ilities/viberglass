interface InstructionFile {
  fileType: string;
  content?: string;
  mountPath?: string;
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
  timestamp: number;
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
