import { kubernetesJobName } from "../../../../workers/invokers/kubernetesJob";
import { KubernetesWorkerStopper } from "../../../../workers/stoppers/KubernetesWorkerStopper";

describe("KubernetesWorkerStopper", () => {
  afterEach(() => delete process.env.KUBERNETES_WORKER_NAMESPACE);

  it("deletes the Job identified by the run ID", async () => {
    process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers";
    const client = {
      createNamespacedJob: jest.fn(),
      readNamespacedJob: jest.fn(),
      deleteNamespacedJob: jest.fn().mockResolvedValue({}),
    };

    await expect(new KubernetesWorkerStopper(async () => client).stop("job-123")).resolves.toBe(true);
    expect(client.deleteNamespacedJob).toHaveBeenCalledWith({
      namespace: "viberglass-workers",
      name: kubernetesJobName("job-123"),
      propagationPolicy: "Background",
    });
  });

  it("ignores a Job that no longer exists", async () => {
    process.env.KUBERNETES_WORKER_NAMESPACE = "viberglass-workers";
    const client = {
      createNamespacedJob: jest.fn(),
      readNamespacedJob: jest.fn(),
      deleteNamespacedJob: jest.fn().mockRejectedValue(Object.assign(new Error("missing"), { statusCode: 404 })),
    };

    await expect(new KubernetesWorkerStopper(async () => client).stop("job-123")).resolves.toBe(false);
  });
});
