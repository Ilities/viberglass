import type { Clanker, Project } from "@viberglass/types";
import { resolveClankerConfig } from "../../clanker-config";
import type { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import type { JobService } from "../../services/JobService";
import type { JobData } from "../../types/Job";
import { ErrorClassification, WorkerError } from "../errors/WorkerError";
import type { InvocationResult, WorkerInvoker } from "../WorkerInvoker";
import { buildWorkerProjectConfig } from "./projectConfig";
import { buildKubernetesJob, kubernetesJobName } from "./kubernetesJob";
import {
  kubernetesStatusCode,
  type KubernetesJobClient,
} from "./kubernetesJobClient";

export class KubernetesInvoker implements WorkerInvoker {
  readonly name = "KubernetesInvoker";

  constructor(
    private readonly clientFactory: () => Promise<KubernetesJobClient>,
    private readonly jobs: Pick<JobService, "saveBootstrapPayload">,
    private readonly credentials: Pick<CredentialRequirementsService, "getRequiredCredentialsForClanker">,
  ) {}

  async invoke(job: JobData, clanker: Clanker, project?: Project): Promise<InvocationResult> {
    const strategy = resolveClankerConfig(clanker).config.strategy;
    if (strategy.type !== "kubernetes") {
      throw new WorkerError(`Clanker deployment strategy is ${strategy.type}, expected kubernetes`, ErrorClassification.PERMANENT);
    }

    const namespace = process.env.KUBERNETES_WORKER_NAMESPACE?.trim();
    const platformApiUrl = process.env.PLATFORM_API_URL?.trim();
    const image = strategy.containerImage?.trim();
    if (!namespace || !platformApiUrl || !image || !job.callbackToken) {
      throw new WorkerError(
        "Kubernetes workers require KUBERNETES_WORKER_NAMESPACE, PLATFORM_API_URL, a container image, and a callback token",
        ErrorClassification.PERMANENT,
      );
    }
    if (strategy.namespace && strategy.namespace !== namespace) {
      throw new WorkerError(`Kubernetes namespace ${strategy.namespace} is not allowed`, ErrorClassification.PERMANENT);
    }

    const payload = job.bootstrapPayload
      ? { ...job.bootstrapPayload, workerType: "kubernetes", callbackToken: job.callbackToken, platformApiUrl }
      : {
          workerType: "kubernetes",
          jobKind: job.jobKind,
          tenantId: job.tenantId,
          jobId: job.id,
          clankerId: clanker.id,
          agent: clanker.agent,
          repository: job.repository,
          task: job.task,
          branch: job.branch,
          baseBranch: job.baseBranch,
          context: job.context,
          settings: job.settings,
          instructionFiles: job.context.instructionFiles ?? [],
          requiredCredentials: await this.credentials.getRequiredCredentialsForClanker(clanker),
          callbackToken: job.callbackToken,
          platformApiUrl,
          deploymentConfig: clanker.deploymentConfig,
          projectConfig: buildWorkerProjectConfig(project),
          scm: job.scm,
          overrides: job.overrides,
        };
    await this.jobs.saveBootstrapPayload(job.id, payload);

    const manifest = buildKubernetesJob({
      jobId: job.id,
      tenantId: job.tenantId,
      image,
      callbackToken: job.callbackToken,
      platformApiUrl,
      config: strategy,
      environmentSecret: process.env.KUBERNETES_WORKER_ENV_SECRET?.trim(),
    });
    const name = kubernetesJobName(job.id);

    try {
      const client = await this.clientFactory();
      await client.createNamespacedJob({ namespace, body: manifest });
      return { workerType: "kubernetes", executionId: name };
    } catch (error) {
      let failure = error;
      if (kubernetesStatusCode(error) === 409) {
        try {
          const client = await this.clientFactory();
          const existing = await client.readNamespacedJob({ namespace, name });
          if (existing.metadata?.annotations?.["viberglass.dev/job-id"] === job.id) {
            return { workerType: "kubernetes", executionId: name };
          }
        } catch (readError) {
          failure = readError;
        }
      }
      if (failure instanceof WorkerError) throw failure;
      const status = kubernetesStatusCode(failure);
      const classification = status === undefined || status === 429 || status >= 500
        ? ErrorClassification.TRANSIENT
        : ErrorClassification.PERMANENT;
      throw new WorkerError(
        `Kubernetes Job creation failed${status ? ` (HTTP ${status})` : ""}: ${failure instanceof Error ? failure.message : String(failure)}`,
        classification,
        failure,
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.KUBERNETES_WORKER_NAMESPACE && process.env.PLATFORM_API_URL);
  }
}
