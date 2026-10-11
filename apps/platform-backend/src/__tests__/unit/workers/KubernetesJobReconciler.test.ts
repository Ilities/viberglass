import { KubernetesJobReconciler } from "../../../workers/KubernetesJobReconciler";

function setup(startedAt = new Date(Date.now() - 300_000)) {
  const client = {
    createNamespacedJob: jest.fn(),
    readNamespacedJob: jest.fn().mockResolvedValue({ status: {} }),
    deleteNamespacedJob: jest.fn(),
  };
  const updateJobStatus = jest.fn().mockResolvedValue(undefined);
  const stop = jest.fn().mockResolvedValue(undefined);
  const inspect = jest.fn().mockResolvedValue({ diagnostics: [] });
  const record = jest.fn().mockResolvedValue(undefined);
  const reconciler = new KubernetesJobReconciler(
    async () => client,
    async () => [{ id: "job-123", started_at: startedAt }],
    { updateJobStatus },
    { stop },
    { inspect },
    { record },
  );
  return { reconciler, client, updateJobStatus, stop, inspect, record };
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

  it("reports startup failures after a short grace period and persists their diagnostics", async () => {
    const { reconciler, inspect, record, updateJobStatus } = setup();
    inspect.mockResolvedValue({ diagnostics: [{ level: "warn", message: "ImagePullBackOff: missing tag" }], startupFailure: "ImagePullBackOff: missing tag" });
    await expect(reconciler.sweep()).resolves.toBe(1);
    expect(record).toHaveBeenCalledWith("job-123", "kubernetes", expect.any(Array));
    expect(updateJobStatus).toHaveBeenCalledWith("job-123", "failed", expect.objectContaining({
      errorMessage: "ImagePullBackOff: missing tag", failureCode: "RUNNER_UNAVAILABLE",
    }));
  });

  it("gives image pulls and scheduling time to recover", async () => {
    const { reconciler, inspect, updateJobStatus } = setup(new Date());
    inspect.mockResolvedValue({ diagnostics: [], startupFailure: "Unschedulable" });
    await expect(reconciler.sweep()).resolves.toBe(0);
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it("keeps healthy runs older than thirty minutes active", async () => {
    const { reconciler, client, updateJobStatus } = setup(new Date(Date.now() - 45 * 60_000));
    client.readNamespacedJob.mockResolvedValue({ status: { active: 1 } });
    await expect(reconciler.sweep()).resolves.toBe(0);
    expect(updateJobStatus).not.toHaveBeenCalled();
  });

  it("still reconciles terminal Jobs when Pod diagnostics are unavailable", async () => {
    const { reconciler, client, inspect } = setup();
    inspect.mockRejectedValue(new Error("Forbidden"));
    client.readNamespacedJob.mockResolvedValue({ status: { conditions: [{ type: "Failed", status: "True", reason: "DeadlineExceeded" }] } });
    await expect(reconciler.sweep()).resolves.toBe(1);
  });

  it("does not stop a run whose result callback won the status update", async () => {
    const { reconciler, client, updateJobStatus, stop } = setup();
    client.readNamespacedJob.mockResolvedValue({ status: { conditions: [{ type: "Failed", status: "True" }] } });
    updateJobStatus.mockResolvedValue(false);
    await expect(reconciler.sweep()).resolves.toBe(0);
    expect(stop).not.toHaveBeenCalled();
  });
});
