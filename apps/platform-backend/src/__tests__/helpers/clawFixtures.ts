import type { ClawExecution, ClawSchedule } from "@viberglass/types";

export function clawExecution(overrides: Partial<ClawExecution> = {}): ClawExecution {
  return {
    id: "execution-1",
    scheduleId: "schedule-1",
    jobId: null,
    status: "pending",
    startedAt: null,
    completedAt: null,
    errorMessage: null,
    result: null,
    webhookDeliveryStatus: null,
    createdAt: "2026-11-09T10:00:00.000Z",
    ...overrides,
  };
}

export function clawSchedule(overrides: Partial<ClawSchedule> = {}): ClawSchedule {
  return {
    id: "schedule-1",
    projectId: "space-1",
    action: "app_stop",
    taskTemplateId: null,
    backupId: null,
    name: "Reset the demo",
    description: null,
    scheduleType: "interval",
    intervalExpression: "1h",
    cronExpression: null,
    timezone: "UTC",
    isActive: true,
    lastRunAt: null,
    nextRunAt: null,
    runCount: 0,
    failureCount: 0,
    webhookConfig: null,
    createdAt: "2026-11-09T10:00:00.000Z",
    updatedAt: "2026-11-09T10:00:00.000Z",
    createdBy: null,
    ...overrides,
  };
}
