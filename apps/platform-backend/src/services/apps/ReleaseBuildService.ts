import { randomUUID } from "crypto";
import type { AppRelease, Clanker, ProjectScmConfig } from "@viberglass/types";
import { SCM_TOKEN_ENV_VAR } from "@viberglass/types";
import { getStrategyType } from "../../clanker-config";
import { createChildLogger } from "../../config/logger";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import type { BuildReleaseJobData, JobScmConfig } from "../../types/Job";
import { WorkerExecutionService } from "../../workers/WorkerExecutionService";
import { CredentialRequirementsService } from "../CredentialRequirementsService";
import { JobBootstrapService } from "../job/JobBootstrapService";
import { JobService } from "../JobService";
import { resolveScmCredentialSecretId, traceCarrierField } from "../ticketRunOrchestration";
import { AppBuilderRunner } from "./AppBuilderRunner";

const logger = createChildLogger({ service: "ReleaseBuildService" });

// Builds belong to no ticket; callbacks are scoped to the job itself.
const BUILD_TENANT_ID = "api-server";

/** Starts a build of one commit of an App space's default branch on the app builder. */
export class ReleaseBuildService {
  constructor(
    private readonly releases: Pick<AppReleaseDAO, "createBuilding" | "setJob" | "delete"> = new AppReleaseDAO(),
    private readonly builder: Pick<AppBuilderRunner, "ready"> = new AppBuilderRunner(),
    private readonly credentials: Pick<IntegrationCredentialDAO, "getById" | "getDefaultForIntegration"> = new IntegrationCredentialDAO(),
    private readonly jobs: Pick<JobService, "submitJob"> = new JobService(),
    private readonly bootstraps: Pick<JobBootstrapService, "saveBootstrapPayload"> = new JobBootstrapService(),
    private readonly requirements: Pick<CredentialRequirementsService, "getRequiredCredentialsForClanker"> = new CredentialRequirementsService(),
    private readonly workers: Pick<WorkerExecutionService, "executeJob"> = new WorkerExecutionService(),
  ) {}

  /** Null when the commit already has a release. */
  async build(scmConfig: ProjectScmConfig, commitSha: string): Promise<AppRelease | null> {
    const secretId = await resolveScmCredentialSecretId(this.credentials, scmConfig);
    if (!secretId) throw new Error("The space's repository connection has no token to clone with");
    const builder = await this.builder.ready();

    const release = await this.releases.createBuilding(scmConfig.projectId, commitSha);
    if (!release) return null;
    try {
      await this.dispatch(release, scmConfig, { ...builder, secretBindings: [{ envVar: SCM_TOKEN_ENV_VAR, secretId }] });
    } catch (error) {
      // Gone again, so the next look at the branch tries this commit once more.
      await this.releases.delete(release.id);
      throw error;
    }
    return release;
  }

  private async dispatch(release: AppRelease, scmConfig: ProjectScmConfig, builder: Clanker): Promise<void> {
    const jobData: BuildReleaseJobData = {
      id: `build_${Date.now()}_${randomUUID().slice(0, 8)}`,
      jobKind: "build_release",
      tenantId: BUILD_TENANT_ID,
      repository: scmConfig.sourceRepository,
      task: `Build ${release.commitSha.slice(0, 7)}`,
      context: { projectId: release.projectId, releaseId: release.id, commitSha: release.commitSha },
      scm: this.scmPayload(scmConfig),
      timestamp: Date.now(),
    };

    const { callbackToken } = await this.jobs.submitJob(jobData, { clankerId: builder.id });
    await this.releases.setJob(release.id, jobData.id);
    jobData.callbackToken = callbackToken;
    jobData.bootstrapPayload = await this.payload(jobData, builder, callbackToken);
    await this.bootstraps.saveBootstrapPayload(jobData.id, jobData.bootstrapPayload);

    this.workers.executeJob(jobData, builder).catch((error) => {
      logger.error("Release build worker invocation failed", {
        jobId: jobData.id,
        releaseId: release.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private scmPayload(scmConfig: ProjectScmConfig): JobScmConfig {
    return {
      integrationId: scmConfig.integrationId,
      integrationSystem: scmConfig.integrationSystem,
      sourceRepository: scmConfig.sourceRepository,
      baseBranch: scmConfig.baseBranch,
      pullRequestRepository: scmConfig.sourceRepository,
      pullRequestBaseBranch: scmConfig.baseBranch,
      credentialEnvVar: SCM_TOKEN_ENV_VAR,
      gitUsername: scmConfig.integrationSystem
        ? integrationRegistry.get(scmConfig.integrationSystem)?.repository?.gitUsername
        : undefined,
    };
  }

  private async payload(jobData: BuildReleaseJobData, builder: Clanker, callbackToken: string): Promise<Record<string, unknown>> {
    const workerType = getStrategyType(builder);
    return {
      workerType,
      jobKind: jobData.jobKind,
      tenantId: jobData.tenantId,
      jobId: jobData.id,
      clankerId: builder.id,
      repository: jobData.repository,
      task: jobData.task,
      context: {},
      release: { releaseId: jobData.context.releaseId, commitSha: jobData.context.commitSha },
      scm: jobData.scm,
      instructionFiles: [],
      requiredCredentials: await this.requirements.getRequiredCredentialsForClanker(builder),
      callbackToken,
      ...(workerType === "docker" ? { clankerConfig: builder } : { deploymentConfig: builder.deploymentConfig }),
      ...traceCarrierField(),
    };
  }
}
