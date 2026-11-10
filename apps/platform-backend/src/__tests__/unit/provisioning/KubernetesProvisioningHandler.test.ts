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

  function validatedImage(validateJob: jest.Mock): string {
    return validateJob.mock.calls[0][1].spec.template.spec.containers[0].image;
  }

  const withoutImage: Clanker = { ...clanker, deploymentConfig: { version: 1, strategy: { type: "kubernetes", provisioningMode: "prebuilt" }, agent: { type: "opencode" } } };

  it("runs the agent's published image at the installation's tag without saving it", async () => {
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "v1.2.1";
    const validateJob = jest.fn().mockResolvedValue(undefined);

    const result = await new KubernetesProvisioningHandler({ validateJob }).provision(withoutImage);

    expect(result.status).toBe("active");
    expect(result.deploymentConfig).toMatchObject({ strategy: { type: "kubernetes" } });
    expect(result.deploymentConfig?.strategy).toEqual(expect.not.objectContaining({ containerImage: expect.anything() }));
    expect(validatedImage(validateJob)).toBe("viberator-worker-opencode:v1.2.1");
  });

  it("moves to a new tag after an upgrade", async () => {
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "v1.2.1";
    const { deploymentConfig } = await new KubernetesProvisioningHandler({ validateJob: jest.fn() }).provision(withoutImage);
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "v1.2.2";
    const validateJob = jest.fn().mockResolvedValue(undefined);

    const result = await new KubernetesProvisioningHandler({ validateJob }).checkAvailability({ ...withoutImage, deploymentConfig });

    expect(result).toEqual({ status: "active", statusMessage: "Kubernetes worker configured: viberator-worker-opencode:v1.2.2" });
    expect(validatedImage(validateJob)).toBe("viberator-worker-opencode:v1.2.2");
  });

  it("keeps a custom image after an upgrade", async () => {
    process.env.VIBERATOR_WORKER_IMAGE_TAG = "v1.2.2";
    const validateJob = jest.fn().mockResolvedValue(undefined);

    await new KubernetesProvisioningHandler({ validateJob }).checkAvailability(clanker);

    expect(validatedImage(validateJob)).toBe("worker:1");
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
