import type { V1Deployment, V1PersistentVolumeClaim, V1Pod } from "@kubernetes/client-node";
import { KubernetesAppHost, type KubernetesAppClient } from "../../../../services/apps/KubernetesAppHost";

const SPEC = {
  instance: "app-space-1",
  projectId: "space-1",
  image: "registry/viberglass-app-runtime-node:latest",
  env: { VIBERGLASS_BUNDLE_URL: "https://storage/bundle", AWS_SECRET_ACCESS_KEY: "s3cr3t-value" },
};
const OPTIONS = {
  namespace: "apps",
  storageClass: null,
  imagePullSecrets: ["registry-login"],
  memoryMb: 512,
  cpus: 1,
  dataSize: "1Gi",
  releaseSize: "2Gi",
};

function apiError(code: number) {
  return Object.assign(new Error(`HTTP ${code}`), { code });
}

function pod(name: string, status: V1Pod["status"] = {}, deleting = false): V1Pod {
  return {
    metadata: { name, creationTimestamp: new Date(name.endsWith("new") ? 2000 : 1000), ...(deleting ? { deletionTimestamp: new Date() } : {}) },
    status,
  };
}

function argsOf<T>(fn: jest.Mock): T[] {
  return fn.mock.calls.map((call: unknown[]) => call[0] as T);
}

function build() {
  let pods: V1Pod[] = [];
  const client = {
    apps: {
      createNamespacedDeployment: jest.fn(async () => ({})),
      replaceNamespacedDeployment: jest.fn(async () => ({})),
      readNamespacedDeployment: jest.fn(async (): Promise<V1Deployment> => ({ spec: { replicas: 1, selector: {}, template: {} } })),
      replaceNamespacedDeploymentScale: jest.fn(async () => ({})),
      deleteNamespacedDeployment: jest.fn(async () => ({})),
    },
    core: {
      createNamespacedService: jest.fn(async () => ({})),
      deleteNamespacedService: jest.fn(async () => ({})),
      createNamespacedSecret: jest.fn(async () => ({})),
      replaceNamespacedSecret: jest.fn(async () => ({})),
      deleteNamespacedSecret: jest.fn(async () => ({})),
      createNamespacedPersistentVolumeClaim: jest.fn(async () => ({})),
      readNamespacedPersistentVolumeClaim: jest.fn(async () => ({})),
      deleteNamespacedPersistentVolumeClaim: jest.fn(async () => ({})),
      listNamespacedPod: jest.fn(async () => ({ items: pods })),
      deleteNamespacedPod: jest.fn(async () => ({})),
      readNamespacedPodLog: jest.fn(async () => "listening on 3000\n"),
    },
  };
  let clock = 0;
  const sleep = jest.fn(async (ms: number) => void (clock += ms));
  const host = new KubernetesAppHost(OPTIONS, async () => client as unknown as KubernetesAppClient, sleep, () => clock);
  return { host, client, sleep, setPods: (next: V1Pod[]) => void (pods = next) };
}

describe("KubernetesAppHost", () => {
  it("creates the instance without starting it, with its env in a Secret", async () => {
    const { host, client } = build();

    await host.create(SPEC);

    expect(client.apps.replaceNamespacedDeploymentScale).toHaveBeenCalledWith(expect.objectContaining({ name: "viberglass-app-space-1", body: expect.objectContaining({ spec: { replicas: 0 } }) }));
    expect(client.core.createNamespacedService).toHaveBeenCalledWith({ namespace: "apps", body: expect.objectContaining({ metadata: expect.objectContaining({ name: "viberglass-app-space-1" }) }) });
    const claims = argsOf<{ body: V1PersistentVolumeClaim }>(client.core.createNamespacedPersistentVolumeClaim).map(({ body }) => [body.metadata?.name, body.spec?.resources?.requests?.storage]);
    expect(claims).toEqual([["viberglass-app-space-1-data", "1Gi"], ["viberglass-app-space-1-release", "2Gi"]]);
    expect(client.core.createNamespacedSecret).toHaveBeenCalledWith({ namespace: "apps", body: expect.objectContaining({ stringData: SPEC.env }) });

    const [{ body: deployment }] = argsOf<{ body: V1Deployment }>(client.apps.createNamespacedDeployment);
    expect(deployment.spec?.replicas).toBe(0);
    expect(deployment.spec?.strategy).toEqual({ type: "Recreate" });
    const podSpec = deployment.spec!.template.spec!;
    expect(podSpec.automountServiceAccountToken).toBe(false);
    expect(podSpec.imagePullSecrets).toEqual([{ name: "registry-login" }]);
    expect(podSpec.securityContext).toMatchObject({ runAsNonRoot: true, runAsUser: 1000 });
    const container = podSpec.containers[0];
    expect(container.envFrom).toEqual([{ secretRef: { name: "viberglass-app-space-1-env" } }]);
    expect(JSON.stringify(deployment)).not.toContain("s3cr3t-value");
    expect(container.env).toEqual([{ name: "PORT", value: "3000" }, { name: "HOME", value: "/tmp" }]);
    expect(container.securityContext).toEqual({ allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } });
    expect(container.resources?.limits).toMatchObject({ cpu: "1", memory: "512Mi" });
  });

  it("replaces the Secret and Deployment of an instance that exists", async () => {
    const { host, client } = build();
    client.core.createNamespacedService.mockRejectedValue(apiError(409));
    client.core.createNamespacedPersistentVolumeClaim.mockRejectedValue(apiError(409));
    client.core.createNamespacedSecret.mockRejectedValue(apiError(409));
    client.apps.createNamespacedDeployment.mockRejectedValue(apiError(409));

    await host.create(SPEC);

    expect(client.core.replaceNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ name: "viberglass-app-space-1-env" }));
    expect(client.apps.replaceNamespacedDeployment).toHaveBeenCalledWith(expect.objectContaining({ name: "viberglass-app-space-1" }));
  });

  it("waits for a volume that's still being removed before making it again", async () => {
    const { host, client, sleep } = build();
    client.core.createNamespacedPersistentVolumeClaim.mockRejectedValueOnce(apiError(409));
    client.core.readNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ metadata: { deletionTimestamp: new Date() } });

    await host.create(SPEC);

    expect(sleep).toHaveBeenCalled();
    expect(client.core.createNamespacedPersistentVolumeClaim).toHaveBeenCalledTimes(3);
  });

  it("stops by scaling to nothing and waits until the pod is gone", async () => {
    const { host, client, setPods } = build();
    setPods([pod("p1")]);
    client.core.deleteNamespacedPod.mockImplementation(async () => {
      setPods([]);
      return {};
    });

    await host.stop("app-space-1", 30);

    expect(client.core.deleteNamespacedPod).toHaveBeenCalledWith({ namespace: "apps", name: "p1", gracePeriodSeconds: 30 });
    expect(client.core.listNamespacedPod).toHaveBeenCalledWith({ namespace: "apps", labelSelector: "viberglass.dev/app-instance=app-space-1" });
  });

  it("stops an instance that was never created", async () => {
    const { host, client } = build();
    client.apps.replaceNamespacedDeploymentScale.mockRejectedValue(apiError(404));

    await expect(host.stop("app-space-1", 30)).resolves.toBeUndefined();
  });

  it("gives up on a pod that doesn't stop", async () => {
    const { host, setPods } = build();
    setPods([pod("p1", {}, true)]);

    await expect(host.stop("app-space-1", 30)).rejects.toThrow("The app's pod didn't stop");
  });

  describe("status", () => {
    it("is missing without a Deployment and stopped with no replicas", async () => {
      const { host, client } = build();
      client.apps.readNamespacedDeployment.mockRejectedValueOnce(apiError(404));
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "missing" });

      client.apps.readNamespacedDeployment.mockResolvedValueOnce({ spec: { replicas: 0, selector: {}, template: {} } });
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "stopped" });
    });

    it("is starting until the newest pod runs", async () => {
      const { host, setPods } = build();
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "starting" });

      setPods([pod("p-old", {}, true), pod("p-new", { containerStatuses: [{ name: "app", state: { running: {} } } as never] })]);
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "running" });
    });

    it("says why a pod can't be scheduled", async () => {
      const { host, setPods } = build();
      setPods([pod("p1", { conditions: [{ type: "PodScheduled", status: "False", message: "0/1 nodes are available: Insufficient memory." }] })]);

      await expect(host.status("app-space-1")).resolves.toEqual({ state: "starting", detail: "0/1 nodes are available: Insufficient memory." });
    });

    it("is restarting after the app exits, and stopped when its image can't be pulled", async () => {
      const { host, setPods } = build();
      setPods([pod("p1", { containerStatuses: [{ name: "app", state: { waiting: { reason: "CrashLoopBackOff" } }, lastState: { terminated: { exitCode: 1 } } } as never] })]);
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "restarting", detail: "The app stopped with exit code 1" });

      setPods([pod("p1", { containerStatuses: [{ name: "app", state: { waiting: { reason: "ImagePullBackOff", message: "Back-off pulling image" } } } as never] })]);
      await expect(host.status("app-space-1")).resolves.toEqual({ state: "stopped", detail: "The app couldn't start: Back-off pulling image" });
    });
  });

  it("reads what a restarting app said before it stopped", async () => {
    const { host, client, setPods } = build();
    setPods([pod("p1", { containerStatuses: [{ name: "app", state: { waiting: {} }, lastState: { terminated: { exitCode: 1 } } } as never] })]);

    await expect(host.logs("app-space-1", 20)).resolves.toBe("listening on 3000\n");
    expect(client.core.readNamespacedPodLog).toHaveBeenCalledWith({ namespace: "apps", name: "p1", container: "app", tailLines: 20, previous: true });

    client.core.readNamespacedPodLog.mockRejectedValueOnce(apiError(400));
    await expect(host.logs("app-space-1", 20)).resolves.toBe("");
  });

  it("clears only the data volume, and deletes everything the instance had", async () => {
    const { host, client } = build();
    await host.clearData("app-space-1");
    expect(client.apps.deleteNamespacedDeployment).toHaveBeenCalledWith(expect.objectContaining({ name: "viberglass-app-space-1" }));
    expect(argsOf<{ name: string }>(client.core.deleteNamespacedPersistentVolumeClaim).map(({ name }) => name)).toEqual(["viberglass-app-space-1-data"]);

    client.core.deleteNamespacedPersistentVolumeClaim.mockClear();
    client.core.deleteNamespacedService.mockRejectedValueOnce(apiError(404));
    await host.delete("app-space-1");
    expect(client.core.deleteNamespacedSecret).toHaveBeenCalledWith({ namespace: "apps", name: "viberglass-app-space-1-env" });
    expect(argsOf<{ name: string }>(client.core.deleteNamespacedPersistentVolumeClaim).map(({ name }) => name)).toEqual([
      "viberglass-app-space-1-data",
      "viberglass-app-space-1-release",
    ]);
  });

  it("reaches the app through its Service", () => {
    expect(build().host.address("preview-p1")).toBe("http://viberglass-preview-p1.apps.svc:3000");
  });
});
