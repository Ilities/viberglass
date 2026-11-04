import type { AppHost, AppInstanceStatus, AppRelease } from "@viberglass/types";
import type { AppPreviewRecord } from "../../persistence/apps/AppPreviewDAO";

/** An app host whose every call is a jest mock that succeeds; tests change what they need. */
export function fakeAppHost() {
  return {
    target: "docker" as const,
    create: jest.fn(async () => undefined),
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    status: jest.fn(async (): Promise<AppInstanceStatus> => ({ state: "running" })),
    address: jest.fn((instance: string) => `http://${instance}:3000`),
    logs: jest.fn(async () => ""),
    clearData: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
    rejoinPlatform: jest.fn(async () => undefined),
  } satisfies AppHost;
}

export function appRelease(id: string, overrides: Partial<AppRelease> = {}): AppRelease {
  return {
    id,
    projectId: "space-1",
    commitSha: `${id}${"0".repeat(40)}`.slice(0, 40),
    status: "ready",
    jobId: null,
    bundleSha256: "a".repeat(64),
    bundleBytes: 1024,
    nodeVersion: "v24.11.0",
    buildLog: null,
    failureReason: null,
    wentLiveAt: null,
    liveFailure: null,
    ticketId: null,
    rolledBackAt: null,
    bundleRemoved: false,
    createdAt: "2026-11-03T12:00:00.000Z",
    finishedAt: "2026-11-03T12:01:00.000Z",
    ...overrides,
  };
}

export function appPreview(overrides: Partial<AppPreviewRecord> = {}): AppPreviewRecord {
  return {
    id: "pv-1",
    address: "preview-abcd2345",
    projectId: "space-1",
    ticketId: "task-1",
    pullRequestUrl: "https://github.com/acme/laptops/pull/3",
    commitSha: "a".repeat(40),
    releaseId: "build-a",
    runningReleaseId: null,
    power: "on",
    state: "off",
    statusMessage: null,
    busySince: null,
    startedAt: null,
    lastOpenedAt: null,
    triedCommitSha: null,
    ...overrides,
  };
}
