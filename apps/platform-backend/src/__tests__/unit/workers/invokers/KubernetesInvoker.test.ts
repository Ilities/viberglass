import { JOB_KIND, type Clanker } from "@viberglass/types";
import type { JobData } from "../../../../types/Job";
import { ErrorClassification, WorkerError } from "../../../../workers/errors/WorkerError";
import { KubernetesInvoker } from "../../../../workers/invokers/KubernetesInvoker";
import { kubernetesJobName } from "../../../../workers/invokers/kubernetesJob";

const job: JobData = {
  id: "job-123",
  jobKind: JOB_KIND.EXECUTION,
  tenantId: "tenant-abc",
  repository: "https://example.com/repo.git",
  task: "Fix a bug",
  context: { ticketId: "ticket-1" },
  callbackToken: "private-callback-token",
  timestamp: 0,
};

const clanker: Clanker = {
  id: "clanker-1",
  name: "Kubernetes worker",
  slug: "kubernetes-worker",
  description: null,
  deploymentStrategyId: null,
  deploymentStrategy: null,
  deploymentConfig: {
    version: 1,
    strategy: { type: "kubernetes", containerImage: "registry.example/worker:1", cpu: "250m" },
    agent: { type: "opencode" },
  },
  configFiles: [],
  agent: "opencode",
  secretIds: [],
  status: "active",
  statusMessage: null,
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

function setup() {
  const client = {
    createNamespacedJob: jest.fn().mockResolvedValue({}),
    readNamespacedJob: jest.fn().mockResolvedValue({}),
    deleteNamespacedJob: jest.fn().mockResolvedValue({}),
  };
  const getDispatchStatus = jest.fn().mockResolvedValue("active");
  const saveBootstrapPayload = jest.fn().mockResolvedValue(undefined);
  const getRequiredCredentialsForClanker = jest.fn().mockResolvedValue(["GITHUB_TOKEN"]);
  const invoker = new KubernetesInvoker(
    async () => client,
    { saveBootstrapPayload },
    { getRequiredCredentialsForClanker },
    { getStatus: getDispatchStatus },
  );
  return { client, saveBootstrapPayload, getDispatchStatus, invoker };
}

describe("KubernetesInvoker", () => {
  beforeEach(() => {
    process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers";
    process.env.PLATFORM_API_URL = "https://platform.example";
  });

  afterEach(() => {
    delete process.env.KUBERNETES_WORKER_NAMESPACE;
    delete process.env.PLATFORM_API_URL;
  });

  it("persists the payload and starts one bounded Job using a reference", async () => {
    const { client, saveBootstrapPayload, invoker } = setup();

    await expect(invoker.invoke(job, clanker)).resolves.toEqual({
      workerType: "kubernetes",
      executionId: kubernetesJobName(job.id),
    });
    expect(saveBootstrapPayload).toHaveBeenCalledWith(job.id, expect.objectContaining({
      workerType: "kubernetes",
      requiredCredentials: ["GITHUB_TOKEN"],
    }));
    const request = client.createNamespacedJob.mock.calls[0][0];
    expect(request.namespace).toBe("viberglass-workers");
    expect(request.body.spec.backoffLimit).toBe(0);
    expect(request.body.spec.template.spec.automountServiceAccountToken).toBe(false);
    expect(request.body.spec.template.spec.containers[0].command).toEqual([
      "node", "apps/viberator/dist/cli-worker.js", "--job-ref", job.id,
    ]);
    expect(request.body.spec.template.spec.containers[0].resources.requests.cpu).toBe("250m");
    expect(JSON.stringify(request.body.metadata)).not.toContain("private-callback-token");
    expect(JSON.stringify(request.body.spec.template.spec.containers[0].command)).not.toContain("private-callback-token");
  });

  it("treats an existing Job for the same run as a successful retry", async () => {
    const { client, invoker } = setup();
    client.createNamespacedJob.mockRejectedValue(Object.assign(new Error("AlreadyExists"), { statusCode: 409 }));
    client.readNamespacedJob.mockResolvedValue({ metadata: { annotations: { "viberglass.dev/job-id": job.id } } });

    await expect(invoker.invoke(job, clanker)).resolves.toEqual({
      workerType: "kubernetes",
      executionId: kubernetesJobName(job.id),
    });
  });

  it("keeps credential values out of persisted bootstrap data", async () => {
    const { saveBootstrapPayload, invoker } = setup();
    await invoker.invoke({ ...job, bootstrapPayload: {
      agentSessionId: "session-1", requiredCredentials: ["AGENT_KEY"], credentials: { AGENT_KEY: "stale-value" },
    } }, clanker);
    const payload = saveBootstrapPayload.mock.calls[0][1];
    expect(payload.agentSessionId).toBe("session-1");
    expect(payload.requiredCredentials).toEqual(["AGENT_KEY"]);
    expect(payload).not.toHaveProperty("credentials");
  });

  it("rejects a namespace outside the configured worker namespace", async () => {
    const { client, invoker } = setup();
    const other = { ...clanker, deploymentConfig: {
      version: 1, strategy: { type: "kubernetes", containerImage: "registry.example/worker:1", namespace: "other" }, agent: { type: "opencode" },
    } };

    await expect(invoker.invoke(job, other)).rejects.toMatchObject({ classification: ErrorClassification.PERMANENT });
    expect(client.createNamespacedJob).not.toHaveBeenCalled();
  });

  it("retries when an existing Job cannot be inspected due to a transport failure", async () => {
    const { client, invoker } = setup();
    client.createNamespacedJob.mockRejectedValue(Object.assign(new Error("AlreadyExists"), { statusCode: 409 }));
    client.readNamespacedJob.mockRejectedValue(new Error("Connection reset"));

    await expect(invoker.invoke(job, clanker)).rejects.toMatchObject({ classification: ErrorClassification.TRANSIENT });
  });

  it.each([[403, ErrorClassification.PERMANENT], [503, ErrorClassification.TRANSIENT]])(
    "classifies Kubernetes HTTP %i failures",
    async (statusCode, classification) => {
      const { client, invoker } = setup();
      client.createNamespacedJob.mockRejectedValue(Object.assign(new Error("API failed"), { statusCode }));
      await expect(invoker.invoke(job, clanker)).rejects.toMatchObject({
        classification,
        name: WorkerError.name,
      });
    },
  );
});

 it("does not dispatch a cancelled run", async () => {
   process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers";
   process.env.PLATFORM_API_URL = "http://backend";
   try {
     const { client, getDispatchStatus, invoker } = setup();
     getDispatchStatus.mockResolvedValue("cancelled");
     await expect(invoker.invoke(job, clanker)).rejects.toThrow("no longer dispatchable");
     expect(client.createNamespacedJob).not.toHaveBeenCalled();
   } finally { delete process.env.KUBERNETES_WORKER_NAMESPACE; delete process.env.PLATFORM_API_URL; }
 });

 it("removes a Job when cancellation races its creation", async () => {
   process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers";
   process.env.PLATFORM_API_URL = "http://backend";
   try {
     const { client, getDispatchStatus, invoker } = setup();
     getDispatchStatus.mockResolvedValueOnce("active").mockResolvedValueOnce("cancelled");
     await expect(invoker.invoke(job, clanker)).rejects.toThrow("cancelled during dispatch");
     expect(client.deleteNamespacedJob).toHaveBeenCalledWith({ namespace: "viberglass-workers", name: kubernetesJobName(job.id), propagationPolicy: "Background" });
   } finally { delete process.env.KUBERNETES_WORKER_NAMESPACE; delete process.env.PLATFORM_API_URL; }
 });
