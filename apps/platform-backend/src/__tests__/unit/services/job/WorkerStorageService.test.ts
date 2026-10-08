import { WorkerStorageDenied, WorkerStorageService } from "../../../../services/job/WorkerStorageService";
import type { JobStatus } from "../../../../types/Job";

function setup(status: JobStatus = "active", tenantId = "tenant") {
  const payload = { workerType: "kubernetes", agentSessionId: "session", instructionFiles: [{ s3Url: "s3://instructions/run/AGENTS.md" }],
    conversationStateUrl: "s3://bucket/conversation-state/session/previous.tar.gz",
    context: { ticketMedia: [{ s3Url: "s3://bucket/media/image.png" }] } };
  const getBootstrapPayload = jest.fn().mockResolvedValue({ tenantId, status, payload });
  const sign = jest.fn().mockResolvedValue("https://storage/signed");
  return { payload, sign, getBootstrapPayload, storage: new WorkerStorageService({ getBootstrapPayload }, sign, () => "bucket") };
}

it.each(["s3://instructions/run/AGENTS.md", "s3://bucket/media/image.png", "s3://bucket/conversation-state/session/previous.tar.gz"])(
  "grants a read only for a stored run reference: %s", async reference => {
    const { storage, sign } = setup();
    expect(await storage.grant("run", "tenant", "read", reference)).toEqual({ storageUrl: reference, url: "https://storage/signed" });
    expect(sign).toHaveBeenCalledWith("read", reference);
  },
);

it.each(["s3://bucket/other-tenant/key", "s3://bucket/media/image.png/../secret", "https://storage/other-key"])(
  "denies an object outside the stored run: %s", async reference => {
    const { storage, sign } = setup();
    await expect(storage.grant("run", "tenant", "read", reference)).rejects.toBeInstanceOf(WorkerStorageDenied);
    expect(sign).not.toHaveBeenCalled();
  },
);

it.each<JobStatus>(["cancelled", "completed", "failed", "queued"])("denies storage for %s runs", async status => {
  const { storage, sign } = setup(status);
  await expect(storage.grant("run", "tenant", "write")).rejects.toBeInstanceOf(WorkerStorageDenied);
  expect(sign).not.toHaveBeenCalled();
});

it("denies a different tenant and non-Kubernetes workers", async () => {
  const { storage, sign, payload } = setup();
  await expect(storage.grant("run", "another-tenant", "write")).rejects.toBeInstanceOf(WorkerStorageDenied);
  payload.workerType = "docker";
  await expect(storage.grant("run", "tenant", "write")).rejects.toBeInstanceOf(WorkerStorageDenied);
  expect(sign).not.toHaveBeenCalled();
});

it("assigns one archive to the run and rejects foreign archive callbacks", async () => {
  const { storage } = setup();
  const grant = await storage.grant("run", "tenant", "write");
  expect(grant.storageUrl).toBe("s3://bucket/conversation-state/session/run.tar.gz");
  await storage.validateArchive("run", "tenant", grant.storageUrl);
  await expect(storage.validateArchive("run", "tenant", "s3://bucket/other-session/run.tar.gz")).rejects.toBeInstanceOf(WorkerStorageDenied);
});
