import type { AppsV1Api, CoreV1Api } from "@kubernetes/client-node";

type AppsApi = Pick<AppsV1Api, "deleteCollectionNamespacedDeployment">;
type CoreApi = Pick<
  CoreV1Api,
  "listNamespacedService" | "deleteNamespacedService" | "deleteCollectionNamespacedSecret" | "deleteCollectionNamespacedPersistentVolumeClaim"
>;

/** What the platform labels every app and preview resource it creates with. */
export const APP_RESOURCE_SELECTOR = "app.kubernetes.io/managed-by=viberglass,app.kubernetes.io/name=viberglass-app";

/**
 * Removes every app and preview the platform runs in its apps namespace:
 * Deployments, Services, Secrets and volumes. Secrets and volumes go by
 * collection, so the cleanup never reads a Secret.
 */
export class AppResourceCleanup {
  constructor(
    private readonly apps: AppsApi,
    private readonly core: CoreApi,
    private readonly namespace: string,
  ) {}

  async run(): Promise<void> {
    const scope = { namespace: this.namespace, labelSelector: APP_RESOURCE_SELECTOR };
    await this.apps.deleteCollectionNamespacedDeployment({ ...scope, propagationPolicy: "Background" });
    const services = await this.core.listNamespacedService(scope);
    for (const service of services.items) {
      const name = service.metadata?.name;
      if (name) await this.core.deleteNamespacedService({ namespace: this.namespace, name });
    }
    await this.core.deleteCollectionNamespacedSecret(scope);
    await this.core.deleteCollectionNamespacedPersistentVolumeClaim(scope);
  }
}
