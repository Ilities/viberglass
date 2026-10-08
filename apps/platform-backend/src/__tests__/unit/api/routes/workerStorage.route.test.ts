import express, { Router } from "express";
import request from "supertest";
import { registerWorkerStorageRoute } from "../../../../api/routes/jobs/workerStorageRoute";
import { WorkerStorageService } from "../../../../services/job/WorkerStorageService";

jest.mock("../../../../services/job/JobCallbackService", () => ({
  validateCallbackToken: jest.fn(async (_id: string, token: string) => token === "run-token"),
}));

function setup() {
  const getBootstrapPayload = jest.fn().mockResolvedValue({ tenantId: "tenant", status: "active", payload: {
    workerType: "kubernetes", instructionFiles: [{ s3Url: "s3://bucket/instructions/run" }],
  } });
  const sign = jest.fn().mockResolvedValue("https://storage/signed");
  const router = Router();
  registerWorkerStorageRoute(router, new WorkerStorageService({ getBootstrapPayload }, sign, () => "bucket"));
  const app = express().use(express.json()).use("/jobs", router);
  return { app, sign, getBootstrapPayload };
}

it("refuses missing or invalid callback tokens before granting storage access", async () => {
  const { app, sign } = setup();
  await request(app).post("/jobs/run/storage-url").send({ operation: "write" }).expect(401);
  await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "wrong").send({ operation: "write" }).expect(403);
  expect(sign).not.toHaveBeenCalled();
});

it("returns an authorized URL with no-store caching and no shared credentials", async () => {
  const { app } = setup();
  const response = await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "run-token")
    .set("X-Tenant-Id", "tenant").send({ operation: "read", storageUrl: "s3://bucket/instructions/run" }).expect(200);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.body).toEqual({ success: true, data: { storageUrl: "s3://bucket/instructions/run", url: "https://storage/signed" } });
});

it("denies another tenant and references outside the run", async () => {
  const { app, sign } = setup();
  await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "run-token")
    .set("X-Tenant-Id", "other").send({ operation: "write" }).expect(403);
  await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "run-token")
    .set("X-Tenant-Id", "tenant").send({ operation: "read", storageUrl: "s3://bucket/other-run" }).expect(403);
  expect(sign).not.toHaveBeenCalled();
});

it("rejects terminal runs and malformed requests", async () => {
  const { app, getBootstrapPayload, sign } = setup();
  getBootstrapPayload.mockResolvedValue({ tenantId: "tenant", status: "cancelled", payload: { workerType: "kubernetes" } });
  await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "run-token")
    .set("X-Tenant-Id", "tenant").send({ operation: "write" }).expect(403);
  await request(app).post("/jobs/run/storage-url").set("X-Callback-Token", "run-token")
    .send({ operation: "delete" }).expect(400);
  expect(sign).not.toHaveBeenCalled();
});
