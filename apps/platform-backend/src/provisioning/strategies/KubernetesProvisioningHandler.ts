import { randomUUID } from "node:crypto";
import type { Clanker } from "@viberglass/types";
import { resolveClankerConfig } from "../../clanker-config";
import { mergeProvisionedStrategyIntoConfig } from "../../clanker-config/mergeProvisionedConfig";
import { buildKubernetesJob } from "../../workers/invokers/kubernetesJob";
import type { KubernetesClientPort } from "../ports/kubernetesClientPort";
import type { ProvisioningStrategyHandler } from "../ProvisioningStrategyHandler";
import { kubernetesEnvironmentError } from "../shared/kubernetesEnvironment";
import { getWorkerImageForClanker } from "../shared/workerImage";
import type { AvailabilityResult, ProvisioningResult } from "../types";

export class KubernetesProvisioningHandler implements ProvisioningStrategyHandler {
  constructor(private readonly client: KubernetesClientPort) {}

  getPreflightError(clanker: Clanker): string | null {
    const environmentError = kubernetesEnvironmentError();
    if (environmentError) return environmentError;
    const config = resolveClankerConfig(clanker).config.strategy;
    if (config.type !== "kubernetes") return "Kubernetes strategy is not configured";
    if (config.namespace && config.namespace !== process.env.KUBERNETES_WORKER_NAMESPACE?.trim()) return "Worker namespace is not allowed";
    if (!getWorkerImageForClanker(clanker, "kubernetes")) return "Worker image is not configured";
    return null;
  }

  async provision(clanker: Clanker): Promise<ProvisioningResult> {
    const strategy = resolveClankerConfig(clanker).config.strategy;
    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...strategy, provisioningMode: "prebuilt", containerImage: getWorkerImageForClanker(clanker, "kubernetes"),
      namespace: process.env.KUBERNETES_WORKER_NAMESPACE?.trim(),
    });
    return { deploymentConfig, ...await this.checkAvailability({ ...clanker, deploymentConfig }) };
  }

  async checkAvailability(clanker: Clanker): Promise<AvailabilityResult> {
    const error = this.getPreflightError(clanker);
    if (error) return { status: "inactive", statusMessage: error };
    const config = resolveClankerConfig(clanker).config.strategy;
    const namespace = process.env.KUBERNETES_WORKER_NAMESPACE?.trim();
    const image = getWorkerImageForClanker(clanker, "kubernetes");
    if (config.type !== "kubernetes" || !namespace || !image) return { status: "inactive", statusMessage: "Worker configuration is incomplete" };
    try {
      await this.client.validateJob(namespace, buildKubernetesJob({
        jobId: randomUUID(), tenantId: "availability-check", image, callbackSecret: "dry-run-only",
        platformApiUrl: process.env.PLATFORM_API_URL || "", config,
        imagePullSecrets: process.env.KUBERNETES_WORKER_IMAGE_PULL_SECRETS?.split(",").map(name => name.trim()).filter(Boolean),
      }));
      return { status: "active", statusMessage: `Kubernetes worker configured: ${image}` };
    } catch (error) {
      return { status: "failed", statusMessage: error instanceof Error ? error.message : "Kubernetes availability check failed" };
    }
  }

  async deprovision(): Promise<ProvisioningResult> {
    return { status: "inactive", statusMessage: "Deactivated by user" };
  }
}
