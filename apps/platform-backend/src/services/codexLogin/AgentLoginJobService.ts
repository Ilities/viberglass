import { randomUUID } from "crypto";
import type { Clanker } from "@viberglass/types";
import { getStrategyType } from "../../clanker-config";
import { createChildLogger } from "../../config/logger";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import type { AgentLoginJobData } from "../../types/Job";
import { WorkerExecutionService } from "../../workers/WorkerExecutionService";
import { CredentialRequirementsService } from "../CredentialRequirementsService";
import { CLANKER_SERVICE_ERROR_CODE, ClankerServiceError } from "../errors/ClankerServiceError";
import { JobBootstrapService } from "../job/JobBootstrapService";
import { JobService } from "../JobService";
import { traceCarrierField } from "../ticketRunOrchestration";
import { usesChatGptLogin } from "./CodexLoginService";

const logger = createChildLogger({ service: "AgentLoginJobService" });

// Login jobs belong to no project or ticket; callbacks are scoped to the job itself.
const LOGIN_TENANT_ID = "api-server";

/**
 * Starts a login-only job on a runner: the worker signs the agent in, reports the
 * device code as progress, and uploads the login when it completes. The runner's page
 * follows the job to show the code and the outcome.
 */
export class AgentLoginJobService {
  constructor(
    private readonly runners: Pick<ClankerDAO, "getClanker"> = new ClankerDAO(),
    private readonly jobs: Pick<JobService, "submitJob"> = new JobService(),
    private readonly bootstraps: Pick<JobBootstrapService, "saveBootstrapPayload"> = new JobBootstrapService(),
    private readonly credentials: Pick<CredentialRequirementsService, "getRequiredCredentialsForClanker"> = new CredentialRequirementsService(),
    private readonly workers: Pick<WorkerExecutionService, "executeJob"> = new WorkerExecutionService(),
  ) {}

  async start(clankerId: string): Promise<{ jobId: string }> {
    const clanker = await this.runners.getClanker(clankerId);
    if (!clanker) {
      throw new ClankerServiceError(CLANKER_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND, "Agent runner not found");
    }
    if (!usesChatGptLogin(clanker)) {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.LOGIN_NOT_APPLICABLE,
        "Only a Codex runner set to sign in with a ChatGPT account has a login to connect.",
      );
    }
    if (clanker.status !== "active" || !clanker.deploymentStrategyId) {
      throw new ClankerServiceError(
        CLANKER_SERVICE_ERROR_CODE.NOT_RUNNING,
        "Start the runner first; the login runs on it.",
      );
    }

    const jobData: AgentLoginJobData = {
      id: `login_${Date.now()}_${randomUUID().slice(0, 8)}`,
      jobKind: "agent_login",
      tenantId: LOGIN_TENANT_ID,
      repository: "",
      task: `Sign ${clanker.name} in`,
      context: {},
      timestamp: Date.now(),
    };

    const { callbackToken } = await this.jobs.submitJob(jobData, { clankerId });
    jobData.callbackToken = callbackToken;
    jobData.bootstrapPayload = await this.buildPayload(jobData, clanker, callbackToken);
    await this.bootstraps.saveBootstrapPayload(jobData.id, jobData.bootstrapPayload);

    this.workers.executeJob(jobData, clanker).catch((error) => {
      logger.error("Agent login worker invocation failed", {
        jobId: jobData.id,
        clankerId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { jobId: jobData.id };
  }

  private async buildPayload(
    jobData: AgentLoginJobData,
    clanker: Clanker,
    callbackToken: string,
  ): Promise<Record<string, unknown>> {
    const workerType = getStrategyType(clanker);
    return {
      workerType,
      jobKind: jobData.jobKind,
      tenantId: jobData.tenantId,
      jobId: jobData.id,
      clankerId: clanker.id,
      agent: clanker.agent,
      repository: jobData.repository,
      task: jobData.task,
      context: jobData.context,
      instructionFiles: [],
      requiredCredentials: await this.credentials.getRequiredCredentialsForClanker(clanker),
      callbackToken,
      ...(workerType === "docker" ? { clankerConfig: clanker } : { deploymentConfig: clanker.deploymentConfig }),
      ...traceCarrierField(),
    };
  }
}
