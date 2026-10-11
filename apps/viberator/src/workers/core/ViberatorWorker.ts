import { createLogger, format, Logger, transports } from "winston";
import * as fs from "fs";
import { CodingJobData, JobResult, WorkerPayload } from "./types";
import { CredentialProvider } from "../infrastructure/CredentialProvider";
import { ConfigLoader } from "../infrastructure/ConfigLoader";
import { PresignedWorkerStorage } from "../infrastructure/PresignedWorkerStorage";
import type { WorkerObjectStorage } from "../infrastructure/workerObjectStorage";
import { InstructionFileManager } from "../runtime/InstructionFileManager";
import { EnvironmentManager } from "../runtime/EnvironmentManager";
import { NO_SETTINGS, workerSettingsOf, type WorkerSettings } from "./workerSettings";
import { selectAgent } from "./selectAgent";
import { createWorkerServices, type WorkerServices } from "./workerServices";
import type { AgentAuthLifecycleFactory } from "./agentAuthLifecycleFactory";
import type { AgentEndpointEnvironmentFactory } from "./agentEndpointEnvironmentFactory";
import { runClawJob } from "./runClawJob";
import { runAgentLoginJob } from "./runAgentLoginJob";
import type { JobRunnerParams } from "./jobPipeline";
import { runSessionTurnJob } from "./runSessionTurnJob";
import { cleanupJobWorkspace, cloneFreshRepository, sendWorkerProgress } from "./workerHelpers";
import { jobWorkspaceDir } from "./taskWorkspace";

export class ViberatorWorker {
  private logger: Logger;
  private readonly workDir: string;
  private credentialProvider!: CredentialProvider;
  private configLoader!: ConfigLoader;
  private objectStorage?: WorkerObjectStorage;
  private instructionFileManager!: InstructionFileManager;
  private environmentManager!: EnvironmentManager;
  private services!: WorkerServices;
  private readonly agentAuthLifecycleFactory: AgentAuthLifecycleFactory;
  private readonly agentEndpointEnvironmentFactory: AgentEndpointEnvironmentFactory;
  private initialized = false;

  private settings: WorkerSettings = NO_SETTINGS;
  private instructionFiles: Map<string, string> = new Map();
  private fetchedCredentials?: Record<string, string | undefined>;
  private currentJobId?: string;
  private currentTenantId?: string;

  constructor(
    agentAuthLifecycleFactory: AgentAuthLifecycleFactory,
    agentEndpointEnvironmentFactory: AgentEndpointEnvironmentFactory,
  ) {
    this.workDir = process.env.WORK_DIR || "/tmp/viberator-work";
    this.agentAuthLifecycleFactory = agentAuthLifecycleFactory;
    this.agentEndpointEnvironmentFactory = agentEndpointEnvironmentFactory;
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: format.json(),
      transports: [new transports.Console()],
    });
  }

  async initialize(payload?: WorkerPayload): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      this.logger.info("Initializing Viberator Coding Worker...");

      this.credentialProvider = new CredentialProvider(this.logger, payload?.workerType === "kubernetes"
        ? { suppliedCredentials: payload.credentials ?? {}, ssmEnabled: false }
        : undefined);
      this.objectStorage = payload?.workerType === "kubernetes" ? new PresignedWorkerStorage(payload) : undefined;
      this.configLoader = new ConfigLoader(this.logger, undefined, this.objectStorage);
      this.instructionFileManager = new InstructionFileManager(this.logger);
      this.environmentManager = new EnvironmentManager(this.logger);

      if (payload) {
        this.settings = workerSettingsOf(payload, this.agentEndpointEnvironmentFactory, this.logger);
        await this.loadPayloadCredentials(payload);
      }

      this.services = await createWorkerServices({
        logger: this.logger,
        workDir: this.workDir,
        settings: this.settings,
        callbackToken: payload?.callbackToken,
        platformApiUrl: payload?.platformApiUrl,
        credentialProvider: this.credentialProvider,
        authFactory: this.agentAuthLifecycleFactory,
        sendProgress: (client, step, message, details) =>
          sendWorkerProgress(client, this.logger, this.currentJobId, this.currentTenantId, step, message, details),
      });

      if (payload) {
        await this.services.agentAuthLifecycle.materializeFromEnvironment();
        this.instructionFiles =
          await this.instructionFileManager.loadFromPayload(
            payload,
            this.configLoader,
          );

        this.logger.info("Worker payload processed", {
          tenantId: payload.tenantId,
          workerType: payload.workerType,
          credentialsFetched: Object.keys(this.fetchedCredentials || {}).length,
          instructionFilesLoaded: this.instructionFiles.size,
        });
      }

      if (!fs.existsSync(this.workDir)) {
        fs.mkdirSync(this.workDir, { recursive: true });
      }

      this.initialized = true;
      this.logger.info("Coding Worker initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Coding Worker", { error });
      throw error;
    }
  }

  async executeTask(data: CodingJobData): Promise<JobResult> {
    if (!this.initialized) {
      throw new Error("Worker is not initialized");
    }

    this.currentJobId = data.id;
    this.currentTenantId = data.tenantId;

    // The space's token comes with the run's credentials; the payload says which, and the username its code host takes.
    const scmToken = data.scm?.credentialEnvVar
      ? this.fetchedCredentials?.[data.scm.credentialEnvVar]
      : undefined;
    const gitAuth = scmToken && data.scm?.gitUsername ? { username: data.scm.gitUsername, token: scmToken } : undefined;

    try {
      const jobRunner =
        data.jobKind === "agent_login"
          ? (params: JobRunnerParams) =>
              runAgentLoginJob({ ...params, agentName: this.settings.requestedAgent ?? "" })
          : data.jobKind === "claw"
            ? runClawJob
            : runSessionTurnJob;

      return await jobRunner({
        data,
        repositoryRoot: this.workDir,
        logger: this.logger,
        gitService: this.services.gitService,
        callbackClient: this.services.callbackClient,
        orchestrator: this.services.orchestrator,
        instructionFileManager: this.instructionFileManager,
        instructionFiles: this.instructionFiles,
        fetchedCredentials: this.fetchedCredentials || {},
        clankerEnvironment: this.settings.clankerEnvironment,
        clankerConfig: this.settings.clankerConfig,
        projectConfig: this.settings.projectConfig,
        overrides: this.settings.overrides,
        agentAuthLifecycle: this.services.agentAuthLifecycle,
        environmentManager: this.environmentManager,
        logForwarder: this.services.logForwarder,
        defaultTimeout: this.services.config.execution.defaultTimeout,
        ...this.settings.turn,
        sessionEventForwarder: this.services.sessionEventForwarder,
        selectAgentForExecution: (availableAgents) => selectAgent(availableAgents, this.settings.requestedAgent, this.logger),
        sendProgress: (step, message, details) =>
          sendWorkerProgress(
            this.services.callbackClient,
            this.logger,
            this.currentJobId,
            this.currentTenantId,
            step,
            message,
            details,
          ),
        gitAuth,
        objectStorage: this.objectStorage,
        mcpServers: this.settings.mcpServers,
        skills: this.settings.skills,
        cloneRepositoryToWorkspace: (repository, branch, workDir) =>
          cloneFreshRepository(this.services.gitService, repository, branch, workDir, gitAuth),
      });
    } finally {
      // Cleanup runs after sendResult has already been called inside jobRunner,
      // so Lambda timeout during cleanup no longer causes the job to appear
      // stuck as "running" on the platform.
      this.services.logForwarder.cleanup();
      this.services.sessionEventForwarder.cleanup();
      this.environmentManager.cleanup(
        this.fetchedCredentials || {},
        this.settings.clankerEnvironment,
      );
      cleanupJobWorkspace(this.logger, jobWorkspaceDir(this.workDir, data));
      this.currentJobId = undefined;
      this.currentTenantId = undefined;
    }
  }

  private async loadPayloadCredentials(payload: WorkerPayload): Promise<void> {
    const credentials = await this.credentialProvider.getCredentials(
      payload.requiredCredentials || [],
    );
    this.fetchedCredentials = credentials;

    this.credentialProvider.validateRequired(
      credentials,
      payload.requiredCredentials || [],
    );

    const agentVisible = (payload.requiredCredentials || [])
      .filter((request) => request.exposeToAgent)
      .map((request) => request.envVar);
    this.environmentManager.inject(credentials, this.settings.clankerEnvironment, agentVisible);
  }
}
