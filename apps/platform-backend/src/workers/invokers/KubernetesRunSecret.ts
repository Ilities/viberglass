import type { CoreV1Api, V1Job } from "@kubernetes/client-node";
import { timingSafeEqual } from "crypto";
import { kubernetesJobName } from "./kubernetesJob";
import { kubernetesStatusCode, loadKubernetesConfig } from "./kubernetesJobClient";

type SecretClient = Pick<CoreV1Api, "createNamespacedSecret" | "readNamespacedSecret" | "deleteNamespacedSecret">;

export async function createKubernetesSecretClient(): Promise<SecretClient> {
  const { CoreV1Api } = await import("@kubernetes/client-node");
  return (await loadKubernetesConfig()).makeApiClient(CoreV1Api);
}

export function kubernetesRunSecretName(jobId: string): string {
  return `${kubernetesJobName(jobId)}-auth`;
}

export class KubernetesRunSecret {
  constructor(private readonly clientFactory: () => Promise<SecretClient>) {}

  async ensure(namespace: string, jobId: string, token: string, job: V1Job): Promise<void> {
    if (!job.metadata?.uid || !job.metadata.name) throw new Error("Kubernetes Job has no identity for Secret ownership");
    const client = await this.clientFactory();
    try {
      await client.createNamespacedSecret({ namespace, body: {
        apiVersion: "v1", kind: "Secret", type: "Opaque", immutable: true,
        metadata: { name: kubernetesRunSecretName(jobId), annotations: { "viberglass.dev/job-id": jobId },
          ownerReferences: [{ apiVersion: "batch/v1", kind: "Job", name: job.metadata.name,
            uid: job.metadata.uid, controller: true, blockOwnerDeletion: false }] },
        stringData: { token },
      } });
    } catch (error) {
      if (kubernetesStatusCode(error) !== 409) throw error;
      const existing = await client.readNamespacedSecret({ namespace, name: kubernetesRunSecretName(jobId) });
      const saved = Buffer.from(existing.data?.token ?? "", "base64");
      const expected = Buffer.from(token);
      if (existing.metadata?.annotations?.["viberglass.dev/job-id"] !== jobId ||
          !existing.metadata.ownerReferences?.some(owner => owner.uid === job.metadata?.uid) ||
          saved.length !== expected.length || !timingSafeEqual(saved, expected)) {
        throw Object.assign(new Error("Existing Kubernetes run Secret does not belong to this dispatch"), { statusCode: 409 });
      }
    }
  }

  async remove(namespace: string, jobId: string): Promise<void> {
    try {
      await (await this.clientFactory()).deleteNamespacedSecret({ namespace, name: kubernetesRunSecretName(jobId) });
    } catch (error) { if (kubernetesStatusCode(error) !== 404) throw error; }
  }
}
