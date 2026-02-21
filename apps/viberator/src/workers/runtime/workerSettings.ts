import { JobOverrides, ProjectConfigPayload } from "../core/types";

export interface WorkerSettings {
  maxChanges?: number;
  testRequired?: boolean;
  codingStandards?: string;
  runTests?: boolean;
  testCommand?: string;
  maxExecutionTime?: number;
}

export interface ResolvedWorkerSettings {
  maxChanges: number;
  testRequired: boolean;
  codingStandards?: string;
  runTests: boolean;
  testCommand: string;
  maxExecutionTime: number;
}

export function mergeWorkerSettings(params: {
  defaults: {
    maxExecutionTime: number;
  };
  jobSettings?: WorkerSettings;
  clankerConfig?: Record<string, unknown>;
  projectConfig?: ProjectConfigPayload;
  overrides?: JobOverrides;
}): ResolvedWorkerSettings {
  const { defaults, jobSettings, clankerConfig, projectConfig, overrides } = params;
  const clankerSettings = getWorkerSettings(clankerConfig?.settings);
  const projectSettings = projectConfig?.workerSettings || {};
  const overrideSettings = overrides?.settings || {};

  return {
    maxChanges:
      overrideSettings.maxChanges ??
      projectSettings.maxChanges ??
      clankerSettings.maxChanges ??
      jobSettings?.maxChanges ??
      5,
    testRequired:
      overrideSettings.testRequired ??
      projectSettings.testRequired ??
      clankerSettings.testRequired ??
      jobSettings?.testRequired ??
      false,
    codingStandards:
      overrideSettings.codingStandards ??
      projectSettings.codingStandards ??
      clankerSettings.codingStandards ??
      jobSettings?.codingStandards,
    runTests:
      overrideSettings.runTests ??
      projectSettings.runTests ??
      clankerSettings.runTests ??
      jobSettings?.runTests ??
      false,
    testCommand:
      overrideSettings.testCommand ??
      projectSettings.testCommand ??
      clankerSettings.testCommand ??
      jobSettings?.testCommand ??
      "npm test",
    maxExecutionTime:
      overrideSettings.maxExecutionTime ??
      projectSettings.maxExecutionTime ??
      clankerSettings.maxExecutionTime ??
      jobSettings?.maxExecutionTime ??
      defaults.maxExecutionTime,
  };
}

function getWorkerSettings(source: unknown): WorkerSettings {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const settings: WorkerSettings = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "maxChanges" && typeof value === "number") {
      settings.maxChanges = value;
      continue;
    }

    if (key === "testRequired" && typeof value === "boolean") {
      settings.testRequired = value;
      continue;
    }

    if (key === "codingStandards" && typeof value === "string") {
      settings.codingStandards = value;
      continue;
    }

    if (key === "runTests" && typeof value === "boolean") {
      settings.runTests = value;
      continue;
    }

    if (key === "testCommand" && typeof value === "string") {
      settings.testCommand = value;
      continue;
    }

    if (key === "maxExecutionTime" && typeof value === "number") {
      settings.maxExecutionTime = value;
    }
  }

  return settings;
}
