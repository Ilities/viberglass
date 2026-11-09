import type { AppsV1Api } from "@kubernetes/client-node";

type ScaleApi = Pick<AppsV1Api, "readNamespacedDeploymentScale" | "replaceNamespacedDeploymentScale">;

const POLL_MS = 2_000;
const STOP_TIMEOUT_MS = 5 * 60_000;

/** Scales the platform's backend Deployment, and waits for it to stop when scaling to zero. */
export class BackendScale {
  constructor(
    private readonly api: ScaleApi,
    private readonly namespace: string,
    private readonly name: string,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async scaleTo(replicas: number): Promise<void> {
    const target = { name: this.name, namespace: this.namespace };
    const scale = await this.api.readNamespacedDeploymentScale(target);
    await this.api.replaceNamespacedDeploymentScale({ ...target, body: { ...scale, spec: { replicas } } });
    if (replicas > 0) return;
    for (let waited = 0; waited < STOP_TIMEOUT_MS; waited += POLL_MS) {
      const current = await this.api.readNamespacedDeploymentScale(target);
      if ((current.status?.replicas ?? 0) === 0) return;
      await this.sleep(POLL_MS);
    }
    throw new Error(`${this.name} still has pods after ${STOP_TIMEOUT_MS / 60_000} minutes`);
  }
}
