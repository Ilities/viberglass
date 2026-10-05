import { KubernetesJobReconciler } from "../../../workers/KubernetesJobReconciler";

function setup(startedAt = new Date(Date.now() - 300_000)) {
  const client = {
    createNamespacedJob: jest.fn(),
    readNamespacedJob: jest.fn().mockResolvedValue({ status: {} }),
    deleteNamespacedJob: jest.fn(),
  };
  const updateJobStatus = jest.fn().mockResolvedValue(undefined);
  const stop = jest.fn().mockResolvedValue(undefined);
  const reconciler = new KubernetesJobReconciler(
    async () => client,
    async () => [{ id: "job-123", started_at: startedAt }],
    { updateJobStatus },
    { stop },
  );
  return { reconciler, client, updateJobStatus, stop };
}

describe("KubernetesJobReconciler", () => {
  beforeEach(() => { process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers"; });
  afterEach(() => { delete process.env.KUBERNETES_WORKER_NAMESPACE; });

  it("fails a run when its Kubernetes Job reports failure", async () => {
    const { reconciler, client, updateJobStatus, stop } = setup();
    client.readNamespacedJob.mockResolvedValue({ status: { failed: 1, conditions: [{ type: "Failed", status: "True" }] } });

    await expect(reconciler.sweep()).resolves.toBe(1);
    expect(updateJobStatus).toHaveBeenCalledWith("job-123", "failed", expect.objectContaining({
      errorMessage: "Kubernetes worker Job failed",
      expectedStatus: "active",
    }));
    expect(stop).toHaveBeenCalledWith("job-123", "Kubernetes Job ended");
  });

  it("waits before treating a missing Job as lost", async () => {
    const { reconciler, client, updateJobStatus } = setup(new Date());
    client.readNamespacedJob.mockRejectedValue(Object.assign(new Error("missing"), { code: 404 }));

    await expect(reconciler.sweep()).resolves.toBe(0);
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it("fails a run when a completed Job has no callback after the grace period", async () => {
    const { reconciler, client, updateJobStatus } = setup();
    client.readNamespacedJob.mockResolvedValue({ status: { succeeded: 1, completionTime: new Date(Date.now() - 300_000) } });

    await expect(reconciler.sweep()).resolves.toBe(1);
    expect(updateJobStatus).toHaveBeenCalledWith("job-123", "failed", expect.objectContaining({
      errorMessage: "Kubernetes worker Job finished without a result callback",
    }));
  });

  it("allows a recently completed Job time to deliver its result", async () => {
    const { reconciler, client, updateJobStatus } = setup();
    client.readNamespacedJob.mockResolvedValue({ status: { succeeded: 1, completionTime: new Date() } });

    await expect(reconciler.sweep()).resolves.toBe(0);
    expect(updateJobStatus).not.toHaveBeenCalled();
  });
});
