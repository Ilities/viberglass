import type { Clanker, Project } from "@viberglass/types";
import { resolveClankerConfig } from "../../clanker-config";
import type { CredentialRequirementsService } from "../../services/CredentialRequirementsService";
import type { JobDispatchStateDAO } from "../../persistence/job/JobDispatchStateDAO";
import type { JobBootstrapService } from "../../services/job/JobBootstrapService";
import type { CodexLoginService } from "../../services/codexLogin/CodexLoginService";
import type { JobData } from "../../types/Job";
import { ErrorClassification, WorkerError } from "../errors/WorkerError";
import type { InvocationResult, WorkerInvoker } from "../WorkerInvoker";
import { buildWorkerProjectConfig } from "./projectConfig";
import { buildKubernetesJob, kubernetesJobName } from "./kubernetesJob";
import { kubernetesWorkerEnvironment } from "./kubernetesWorkerEnvironment";
import { kubernetesRunSecretName, type KubernetesRunSecret } from "./KubernetesRunSecret";
import {
  kubernetesStatusCode,
  type KubernetesJobClient,
} from "./kubernetesJobClient";

export class KubernetesInvoker implements WorkerInvoker {
  readonly name = "KubernetesInvoker";

  constructor(
    private readonly clientFactory: () => Promise<KubernetesJobClient>,
    private readonly jobs: Pick<JobBootstrapService, "saveBootstrapPayload">,
    private readonly credentials: Pick<CredentialRequirementsService, "getRequiredCredentialsForClanker">,
    private readonly dispatchState: Pick<JobDispatchStateDAO, "getStatus">,
    private readonly codexLogins: Pick<CodexLoginService, "workerBindings">,
    private readonly secrets: Pick<KubernetesRunSecret, "ensure" | "remove">,
  ) {}

  async invoke(job: JobData, clanker: Clanker, project?: Project): Promise<InvocationResult> {
    const config = resolveClankerConfig(clanker).config;
    const strategy = config.strategy;
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

    const status = await this.dispatchState.getStatus(job.id);
    if (status !== "queued" && status !== "active") {
      throw new WorkerError("Run is no longer dispatchable", ErrorClassification.PERMANENT);
    }

    const payload: Record<string, unknown> = job.bootstrapPayload
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
          callbackToken: job.callbackToken,
          platformApiUrl,
          deploymentConfig: clanker.deploymentConfig,
          projectConfig: buildWorkerProjectConfig(project),
          scm: job.scm,
          overrides: job.overrides,
        };
    const codex = config.agent.type === "codex" ? config.agent.codexAuth : undefined;
    payload.requiredCredentials ??= await this.credentials.getRequiredCredentialsForClanker(clanker);
    payload.credentialBindings = [...(clanker.secretBindings ?? []), ...this.codexLogins.workerBindings(clanker)];
    payload.optionalCredentials = codex && codex.mode !== "api_key" && !codex.loginSecretId ? [codex.secretName] : [];
    delete payload.credentials;
    await this.jobs.saveBootstrapPayload(job.id, payload);

    const manifest = buildKubernetesJob({
      jobId: job.id,
      tenantId: job.tenantId,
      image,
      callbackSecret: kubernetesRunSecretName(job.id),
      platformApiUrl,
      config: strategy,
      environmentSecret: process.env.KUBERNETES_WORKER_ENV_SECRET?.trim(),
      imagePullSecrets: process.env.KUBERNETES_WORKER_IMAGE_PULL_SECRETS?.split(",").map(name => name.trim()).filter(Boolean),
      environment: kubernetesWorkerEnvironment(process.env),
    });
    const name = kubernetesJobName(job.id);
    let submitted = false;

    try {
      const client = await this.clientFactory();
      const created = await client.createNamespacedJob({ namespace, body: manifest });
      submitted = true;
      await this.secrets.ensure(namespace, job.id, job.callbackToken, created);
      await this.removeCancelledJob(client, namespace, name, job.id);
      return { workerType: "kubernetes", executionId: name };
    } catch (error) {
      let failure = error;
      if (kubernetesStatusCode(error) === 409) {
        try {
          const client = await this.clientFactory();
          const existing = await client.readNamespacedJob({ namespace, name });
          if (existing.metadata?.annotations?.["viberglass.dev/job-id"] === job.id) {
            submitted = true;
            await this.secrets.ensure(namespace, job.id, job.callbackToken, existing);
            await this.removeCancelledJob(client, namespace, name, job.id);
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
      if (submitted && classification === ErrorClassification.PERMANENT && status !== 409) {
        await (await this.clientFactory()).deleteNamespacedJob({ namespace, name, propagationPolicy: "Background" });
        await this.secrets.remove(namespace, job.id);
      }
      throw new WorkerError(
        `Kubernetes Job creation failed${status ? ` (HTTP ${status})` : ""}: ${failure instanceof Error ? failure.message : String(failure)}`,
        classification,
        failure,
      );
    }
  }

  private async removeCancelledJob(client: KubernetesJobClient, namespace: string, name: string, jobId: string): Promise<void> {
    if (await this.dispatchState.getStatus(jobId) !== "cancelled") return;
    try { await client.deleteNamespacedJob({ namespace, name, propagationPolicy: "Background" }); }
    catch (error) { if (kubernetesStatusCode(error) !== 404) throw error; }
    await this.secrets.remove(namespace, jobId);
    throw new WorkerError("Run was cancelled during dispatch", ErrorClassification.PERMANENT);
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.KUBERNETES_WORKER_NAMESPACE && process.env.PLATFORM_API_URL);
  }
}
