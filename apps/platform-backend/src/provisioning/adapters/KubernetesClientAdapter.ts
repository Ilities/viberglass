import type { KubernetesClientPort } from "../ports/kubernetesClientPort";
import type { V1Job } from "@kubernetes/client-node";
import { loadKubernetesConfig } from "../../workers/invokers/kubernetesJobClient";

export class KubernetesClientAdapter implements KubernetesClientPort {
  async validateJob(namespace: string, job: V1Job): Promise<void> {
    const { AuthorizationV1Api, BatchV1Api } = await import("@kubernetes/client-node");
    const config = await loadKubernetesConfig();
    const authorization = config.makeApiClient(AuthorizationV1Api);
    for (const verb of ["get", "delete"]) {
      const review = await authorization.createSelfSubjectAccessReview({ body: {
        apiVersion: "authorization.k8s.io/v1", kind: "SelfSubjectAccessReview",
        spec: { resourceAttributes: { namespace, group: "batch", resource: "jobs", verb } },
      } });
      if (!review.status?.allowed) throw new Error(`Backend is not allowed to ${verb} Jobs in ${namespace}`);
    }
    await config.makeApiClient(BatchV1Api).createNamespacedJob({ namespace, body: job, dryRun: "All" });
  }
}
