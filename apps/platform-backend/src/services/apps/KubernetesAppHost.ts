import type { AppsV1Api, CoreV1Api, V1Pod } from "@kubernetes/client-node";
import type { AppHost, AppInstanceSpec, AppInstanceStatus } from "@viberglass/types";
import { kubernetesStatusCode, loadKubernetesConfig } from "../../workers/invokers/kubernetesJobClient";
import { APP_STOP_GRACE_SECONDS } from "./appHostingConfig";
import {
  APP_PORT,
  INSTANCE_LABEL,
  appClaim,
  appDeployment,
  appEnvSecret,
  appService,
  kubernetesAppNames,
} from "./kubernetesAppResources";

export interface KubernetesAppClient {
  apps: Pick<
    AppsV1Api,
    "createNamespacedDeployment" | "replaceNamespacedDeployment" | "readNamespacedDeployment" | "replaceNamespacedDeploymentScale" | "deleteNamespacedDeployment"
  >;
  core: Pick<
    CoreV1Api,
    | "createNamespacedService"
    | "deleteNamespacedService"
    | "createNamespacedSecret"
    | "replaceNamespacedSecret"
    | "deleteNamespacedSecret"
    | "createNamespacedPersistentVolumeClaim"
    | "readNamespacedPersistentVolumeClaim"
    | "deleteNamespacedPersistentVolumeClaim"
    | "listNamespacedPod"
    | "deleteNamespacedPod"
    | "readNamespacedPodLog"
  >;
}

export async function createKubernetesAppClient(): Promise<KubernetesAppClient> {
  const { AppsV1Api, CoreV1Api } = await import("@kubernetes/client-node");
  const config = await loadKubernetesConfig();
  return { apps: config.makeApiClient(AppsV1Api), core: config.makeApiClient(CoreV1Api) };
}

export interface KubernetesAppHostOptions {
  namespace: string;
  storageClass: string | null;
  imagePullSecrets: string[];
  memoryMb: number;
  cpus: number;
  /** Sizes of the data and release volumes, such as 1Gi. */
  dataSize: string;
  releaseSize: string;
}

const POLL_MS = 1000;
// Pods and volumes being removed; a volume goes once its pod has.
const REMOVAL_WAIT_MS = 120_000;
// Reasons a pod won't get past without someone changing something.
const STUCK_REASONS = new Set(["ImagePullBackOff", "InvalidImageName", "CreateContainerConfigError", "CreateContainerError"]);

/**
 * Runs each app and each preview as a one-replica Deployment with a Service in
 * the apps namespace. Its data and its unpacked release live on their own
 * volumes, which outlive the pod. NetworkPolicies in the chart let only the
 * platform reach apps, and apps reach only object storage and the internet.
 */
export class KubernetesAppHost implements AppHost {
  readonly target = "kubernetes" as const;
  private client: Promise<KubernetesAppClient> | null = null;

  constructor(
    private readonly options: KubernetesAppHostOptions,
    private readonly clientFactory: () => Promise<KubernetesAppClient> = createKubernetesAppClient,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    private readonly now: () => number = Date.now,
  ) {}

  async create(spec: AppInstanceSpec): Promise<void> {
    const k = await this.k8s();
    const name = kubernetesAppNames(spec.instance);
    const namespace = this.options.namespace;
    // Like replacing a container: whatever still runs is stopped first.
    await this.stop(spec.instance, 1);
    await ignoring(409, k.core.createNamespacedService({ namespace, body: appService(spec, name) }));
    await this.ensureClaim(appClaim(spec, name.data, this.options.dataSize, this.options.storageClass));
    await this.ensureClaim(appClaim(spec, name.release, this.options.releaseSize, this.options.storageClass));
    const secret = appEnvSecret(spec, name);
    await k.core.createNamespacedSecret({ namespace, body: secret }).catch((error: unknown) => {
      if (kubernetesStatusCode(error) !== 409) throw error;
      return k.core.replaceNamespacedSecret({ namespace, name: name.secret, body: secret });
    });
    const deployment = appDeployment(spec, name, {
      memoryMb: this.options.memoryMb,
      cpus: this.options.cpus,
      stopGraceSeconds: APP_STOP_GRACE_SECONDS,
      imagePullSecrets: this.options.imagePullSecrets,
    });
    await k.apps.createNamespacedDeployment({ namespace, body: deployment }).catch((error: unknown) => {
      if (kubernetesStatusCode(error) !== 409) throw error;
      return k.apps.replaceNamespacedDeployment({ namespace, name: name.deployment, body: deployment });
    });
  }

  async start(instance: string): Promise<void> {
    await this.scale(instance, 1);
  }

  /** Waits until the pod is gone, so a backup taken next has Litestream's last sync. */
  async stop(instance: string, graceSeconds: number): Promise<void> {
    try {
      await this.scale(instance, 0);
    } catch (error) {
      if (kubernetesStatusCode(error) !== 404) throw error;
    }
    await this.removePods(instance, graceSeconds);
  }

  async status(instance: string): Promise<AppInstanceStatus> {
    const k = await this.k8s();
    let replicas: number;
    try {
      const deployment = await k.apps.readNamespacedDeployment({ namespace: this.options.namespace, name: kubernetesAppNames(instance).deployment });
      replicas = deployment.spec?.replicas ?? 0;
    } catch (error) {
      if (kubernetesStatusCode(error) === 404) return { state: "missing" };
      throw error;
    }
    if (replicas === 0) return { state: "stopped" };

    const pod = newest((await this.pods(instance)).filter((p) => !p.metadata?.deletionTimestamp));
    const container = pod?.status?.containerStatuses?.find((c) => c.name === "app");
    if (container?.state?.running) return { state: "running" };
    const waiting = container?.state?.waiting;
    if (waiting?.reason && STUCK_REASONS.has(waiting.reason)) {
      return { state: "stopped", detail: `The app couldn't start: ${waiting.message || waiting.reason}` };
    }
    const exited = container?.lastState?.terminated ?? container?.state?.terminated;
    if (exited) return { state: "restarting", detail: `The app stopped with exit code ${exited.exitCode}` };
    const unscheduled = pod?.status?.conditions?.find((c) => c.type === "PodScheduled" && c.status === "False");
    return unscheduled?.message ? { state: "starting", detail: unscheduled.message } : { state: "starting" };
  }

  address(instance: string): string {
    return `http://${kubernetesAppNames(instance).service}.${this.options.namespace}.svc:${APP_PORT}`;
  }

  async logs(instance: string, tailLines: number): Promise<string> {
    const k = await this.k8s();
    const pod = newest(await this.pods(instance));
    if (!pod?.metadata?.name) return "";
    const container = pod.status?.containerStatuses?.find((c) => c.name === "app");
    // A container that's waiting to start again has nothing yet; what it said before it stopped is the useful part.
    const previous = !container?.state?.running && Boolean(container?.lastState?.terminated);
    try {
      return await k.core.readNamespacedPodLog({ namespace: this.options.namespace, name: pod.metadata.name, container: "app", tailLines, previous });
    } catch (error) {
      // 400: the container hasn't started.
      const status = kubernetesStatusCode(error);
      if (status === 400 || status === 404) return "";
      throw error;
    }
  }

  async clearData(instance: string): Promise<void> {
    await this.removeDeployment(instance);
    await this.remove((k, namespace) => k.core.deleteNamespacedPersistentVolumeClaim({ namespace, name: kubernetesAppNames(instance).data }));
  }

  async delete(instance: string): Promise<void> {
    const name = kubernetesAppNames(instance);
    await this.removeDeployment(instance);
    await this.remove((k, namespace) => k.core.deleteNamespacedService({ namespace, name: name.service }));
    await this.remove((k, namespace) => k.core.deleteNamespacedSecret({ namespace, name: name.secret }));
    await this.remove((k, namespace) => k.core.deleteNamespacedPersistentVolumeClaim({ namespace, name: name.data }));
    await this.remove((k, namespace) => k.core.deleteNamespacedPersistentVolumeClaim({ namespace, name: name.release }));
  }

  /** Services and NetworkPolicies don't change when the platform's pods are replaced. */
  async rejoinPlatform(): Promise<void> {}

  private k8s(): Promise<KubernetesAppClient> {
    this.client ??= this.clientFactory().catch((error: unknown) => {
      this.client = null;
      throw error;
    });
    return this.client;
  }

  private async scale(instance: string, replicas: number): Promise<void> {
    const k = await this.k8s();
    const name = kubernetesAppNames(instance).deployment;
    const namespace = this.options.namespace;
    await k.apps.replaceNamespacedDeploymentScale({ namespace, name, body: { metadata: { name, namespace }, spec: { replicas } } });
  }

  private async pods(instance: string): Promise<V1Pod[]> {
    const k = await this.k8s();
    const list = await k.core.listNamespacedPod({ namespace: this.options.namespace, labelSelector: `${INSTANCE_LABEL}=${instance}` });
    return list.items;
  }

  private async removeDeployment(instance: string): Promise<void> {
    await this.remove((k, namespace) =>
      k.apps.deleteNamespacedDeployment({ namespace, name: kubernetesAppNames(instance).deployment, propagationPolicy: "Background" }),
    );
    await this.removePods(instance, 1);
  }

  /** Deletes the instance's pods with this grace period and waits until they're gone. */
  private async removePods(instance: string, graceSeconds: number): Promise<void> {
    const k = await this.k8s();
    const namespace = this.options.namespace;
    for (const pod of await this.pods(instance)) {
      const name = pod.metadata?.name;
      if (name) await ignoring(404, k.core.deleteNamespacedPod({ namespace, name, gracePeriodSeconds: graceSeconds }));
    }
    await this.waitUntil(async () => (await this.pods(instance)).length === 0, graceSeconds * 1000 + REMOVAL_WAIT_MS, `The app's pod didn't stop`);
  }

  /** A volume removed a moment ago may still be going; the new one waits for it. */
  private async ensureClaim(claim: ReturnType<typeof appClaim>): Promise<void> {
    const k = await this.k8s();
    const namespace = this.options.namespace;
    const name = claim.metadata!.name!;
    await this.waitUntil(async () => {
      try {
        await k.core.createNamespacedPersistentVolumeClaim({ namespace, body: claim });
        return true;
      } catch (error) {
        if (kubernetesStatusCode(error) !== 409) throw error;
      }
      try {
        const existing = await k.core.readNamespacedPersistentVolumeClaim({ namespace, name });
        return !existing.metadata?.deletionTimestamp;
      } catch (error) {
        if (kubernetesStatusCode(error) === 404) return false;
        throw error;
      }
    }, REMOVAL_WAIT_MS, `The app's volume ${name} is still being removed`);
  }

  private async remove(call: (k: KubernetesAppClient, namespace: string) => Promise<unknown>): Promise<void> {
    await ignoring(404, call(await this.k8s(), this.options.namespace));
  }

  private async waitUntil(done: () => Promise<boolean>, timeoutMs: number, failure: string): Promise<void> {
    const deadline = this.now() + timeoutMs;
    while (!(await done())) {
      if (this.now() >= deadline) throw new Error(failure);
      await this.sleep(POLL_MS);
    }
  }
}

async function ignoring(status: number, call: Promise<unknown>): Promise<void> {
  try {
    await call;
  } catch (error) {
    if (kubernetesStatusCode(error) !== status) throw error;
  }
}

function newest(pods: V1Pod[]): V1Pod | undefined {
  const created = (pod: V1Pod) => new Date(pod.metadata?.creationTimestamp ?? 0).getTime();
  return [...pods].sort((a, b) => created(b) - created(a))[0];
}
