import type { Clanker } from "@viberglass/types";
import { KubernetesProvisioningHandler } from "../../../provisioning/strategies/KubernetesProvisioningHandler";

const clanker: Clanker = {
  id: "runner", name: "Runner", slug: "runner", description: null,
  deploymentStrategyId: null, deploymentStrategy: null,
  deploymentConfig: { version: 1, strategy: { type: "kubernetes", containerImage: "worker:1", cpu: "250m" }, agent: { type: "opencode" } },
  agent: "opencode", secretBindings: [], mcpServerIds: [], skillIds: [], configFiles: [], status: "inactive", statusMessage: null, createdAt: "", updatedAt: "",
};

describe("KubernetesProvisioningHandler", () => {
  const previousEnv = process.env;
  beforeEach(() => { process.env = { ...previousEnv, KUBERNETES_WORKER_NAMESPACE: "workers", PLATFORM_API_URL: "http://backend:3000", S3_BUCKET: "storage", KUBERNETES_WORKER_ENV_SECRET: "storage" }; });
  afterEach(() => { process.env = previousEnv; });

  it("validates admission and permissions without creating a real worker", async () => {
    const validateJob = jest.fn().mockResolvedValue(undefined);
    const handler = new KubernetesProvisioningHandler({ validateJob });
    expect(await handler.provision(clanker)).toMatchObject({ status: "active", deploymentConfig: { strategy: { type: "kubernetes", namespace: "workers", cpu: "250m", containerImage: "worker:1" } } });
    expect(validateJob).toHaveBeenCalledWith("workers", expect.objectContaining({ spec: expect.objectContaining({ template: expect.objectContaining({ spec: expect.objectContaining({ automountServiceAccountToken: false }) }) }) }));
  });

  it("rejects namespaces outside the configured boundary", async () => {
    const validateJob = jest.fn();
    const result = await new KubernetesProvisioningHandler({ validateJob }).checkAvailability({ ...clanker, deploymentConfig: { version: 1, strategy: { type: "kubernetes", namespace: "other" }, agent: { type: "opencode" } } });
    expect(result).toMatchObject({ status: "inactive", statusMessage: "Worker namespace is not allowed" });
    expect(validateJob).not.toHaveBeenCalled();
  });

  it("reports Kubernetes admission failures", async () => {
    const validateJob = jest.fn().mockRejectedValue(new Error("Forbidden by quota"));
    expect(await new KubernetesProvisioningHandler({ validateJob }).checkAvailability(clanker)).toEqual({ status: "failed", statusMessage: "Forbidden by quota" });
  });

  it("requires durable storage before exposing the strategy", () => {
    delete process.env.S3_BUCKET;
    delete process.env.AWS_S3_BUCKET;
    expect(new KubernetesProvisioningHandler({ validateJob: jest.fn() }).getPreflightError(clanker)).toContain("S3_BUCKET");
  });
});
