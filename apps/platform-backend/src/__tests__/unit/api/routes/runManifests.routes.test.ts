import express from "express";
import request from "supertest";

const mockRecords = jest.fn();
const mockList = jest.fn();
const mockGet = jest.fn();

jest.mock("../../../../services/RunManifestExportService", () => ({
  RunManifestExportService: jest.fn(() => ({ records: mockRecords })),
}));
jest.mock("../../../../persistence/job/RunManifestExportDAO", () => ({
  RunManifestExportDAO: jest.fn(),
}));
jest.mock("../../../../persistence/job/RunRecordDAO", () => ({
  RunRecordDAO: jest.fn(),
}));
jest.mock("../../../../services/runRecords/RunRecordService", () => {
  class InvalidRunRecordCursorError extends Error {}
  return {
    InvalidRunRecordCursorError,
    RunRecordService: jest.fn(() => ({ list: mockList, get: mockGet })),
  };
});

import runManifestsRouter from "../../../../api/routes/runManifests";
import { InvalidRunRecordCursorError } from "../../../../services/runRecords/RunRecordService";

async function* yieldAll<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function* failAfterFirst(): AsyncGenerator<{ manifest: { job_id: string } }> {
  yield { manifest: { job_id: "a" } };
  throw new Error("database went away");
}

describe("GET /api/run-manifests/export", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use("/api/run-manifests", runManifestsRouter);
  });

  it("streams one JSON record per line", async () => {
    mockRecords.mockReturnValue(
      yieldAll([
        { manifest: { job_id: "a" }, pullRequestOutcome: null },
        { manifest: { job_id: "b" }, pullRequestOutcome: { state: "merged" } },
      ]),
    );

    const response = await request(app).get("/api/run-manifests/export").expect(200);

    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.text.trimEnd().split("\n").map((line) => JSON.parse(line))).toEqual([
      { manifest: { job_id: "a" }, pullRequestOutcome: null },
      { manifest: { job_id: "b" }, pullRequestOutcome: { state: "merged" } },
    ]);
  });

  it("passes the parsed filter to the export", async () => {
    mockRecords.mockReturnValue(yieldAll([]));

    await request(app)
      .get("/api/run-manifests/export?since=2026-09-01&until=2026-10-01&includeLogs=true")
      .expect(200);

    expect(mockRecords).toHaveBeenCalledWith({
      since: new Date("2026-09-01"),
      until: new Date("2026-10-01"),
      includeLogs: true,
    });
  });

  it("defaults to no logs", async () => {
    mockRecords.mockReturnValue(yieldAll([]));

    await request(app).get("/api/run-manifests/export").expect(200);

    expect(mockRecords).toHaveBeenCalledWith({ includeLogs: false });
  });

  it("rejects an invalid date", async () => {
    await request(app).get("/api/run-manifests/export?since=yesterday").expect(400);

    expect(mockRecords).not.toHaveBeenCalled();
  });

  it("cuts the stream when the export fails part-way", async () => {
    mockRecords.mockReturnValue(failAfterFirst());

    await expect(request(app).get("/api/run-manifests/export")).rejects.toThrow();
  });
});

describe("GET /api/run-manifests", () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use("/api/run-manifests", runManifestsRouter);
  });

  it("lists a page with the default limit", async () => {
    mockList.mockResolvedValue({ records: [], nextCursor: null });

    const response = await request(app).get("/api/run-manifests").expect(200);

    expect(mockList).toHaveBeenCalledWith(undefined, 50);
    expect(response.body).toEqual({ records: [], nextCursor: null });
  });

  it("passes the cursor and limit through", async () => {
    mockList.mockResolvedValue({ records: [], nextCursor: null });

    await request(app).get("/api/run-manifests?cursor=abc&limit=10").expect(200);

    expect(mockList).toHaveBeenCalledWith("abc", 10);
  });

  it("rejects a limit over 100", async () => {
    await request(app).get("/api/run-manifests?limit=101").expect(400);
  });

  it("rejects a malformed cursor", async () => {
    mockList.mockRejectedValue(new InvalidRunRecordCursorError());

    await request(app).get("/api/run-manifests?cursor=zzz").expect(400);
  });

  it("returns one run's record", async () => {
    mockGet.mockResolvedValue({ jobId: "job-1" });

    const response = await request(app).get("/api/run-manifests/job-1").expect(200);

    expect(mockGet).toHaveBeenCalledWith("job-1");
    expect(response.body).toEqual({ jobId: "job-1" });
  });

  it("returns 404 for a run without a record", async () => {
    mockGet.mockResolvedValue(null);

    await request(app).get("/api/run-manifests/job-9").expect(404);
  });

  it("still routes /export to the export", async () => {
    mockRecords.mockReturnValue(yieldAll([]));

    await request(app).get("/api/run-manifests/export").expect(200);

    expect(mockGet).not.toHaveBeenCalled();
  });
});
