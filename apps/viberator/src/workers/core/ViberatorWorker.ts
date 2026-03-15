import { createLogger, format, transports, Logger } from "winston";
import * as path from "path";
import * as fs from "fs";
import { ConfigManager } from "../../config/ConfigManager";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
import { AcpExecutor } from "../../orchestrator/AcpExecutor";
import { AgentConfig, Configuration } from "../../types";
import GitService from "../../services/GitService";
import {
  CodingJobData,
  JobResult,
  WorkerPayload,
  JobOverrides,
  ProjectConfigPayload,
} from "./types";
import { CallbackClient } from "../infrastructure/CallbackClient";
import { CredentialProvider } from "../infrastructure/CredentialProvider";
import { ConfigLoader } from "../infrastructure/ConfigLoader";
import { InstructionFileManager } from "../runtime/InstructionFileManager";
import { EnvironmentManager } from "../runtime/EnvironmentManager";
import { LogForwarder } from "../runtime/LogForwarder";
import { SessionEventForwarder } from "../../acp/SessionEventForwarder";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { AgentAuthLifecycleFactory } from "./agentAuthLifecycleFactory";
import type { AgentEndpointEnvironmentFactory } from "./agentEndpointEnvironmentFactory";
import { runCodingJob } from "./runCodingJob";
import { runResearchJob } from "./runResearchJob";
import { runPlanningJob } from "./runPlanningJob";
import { runSessionTurnJob } from "./runSessionTurnJob";
import {
  extractClankerEnvironment,
  normalizeAgentName,
  resolveClankerConfig,
} from "./workerConfig";
import { sendWorkerProgress, cleanupJobWorkspace } from "./workerHelpers";

export class ViberatorWorker {
  private logger: Logger;
  private config!: Configuration;
  private orchestrator!: AgentOrchestrator;
  private readonly workDir: string;
  private gitService!: GitService;
  private callbackClient!: CallbackClient;
  private credentialProvider!: CredentialProvider;
  private configLoader!: ConfigLoader;
  private instructionFileManager!: InstructionFileManager;
  private environmentManager!: EnvironmentManager;
  private logForwarder!: LogForwarder;
  private sessionEventForwarder!: SessionEventForwarder;
  private agentAuthLifecycle!: AgentAuthLifecycle;
  private readonly agentAuthLifecycleFactory: AgentAuthLifecycleFactory;
  private readonly agentEndpointEnvironmentFactory: AgentEndpointEnvironmentFactory;
  private initialized = false;

  private clankerConfig?: { clankerId: string } & Record<string, unknown>;
  private clankerEnvironment?: Record<string, string>;
  private requestedAgent?: string;
  private projectConfig?: ProjectConfigPayload;
  private overrides?: JobOverrides;
  private instructionFiles: Map<string, string> = new Map();
  private fetchedCredentials?: Record<string, string | undefined>;
  private currentJobId?: string;
  private currentTenantId?: string;
  // ACP session fields — populated from payload on interactive (multi-turn) jobs.
  private agentSessionId?: string;
  private agentTurnId?: string;
  private sessionMode?: "research" | "planning" | "execution";
  private acpSessionId?: string;

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

      this.credentialProvider = new CredentialProvider(this.logger);
      this.configLoader = new ConfigLoader(this.logger);
      this.instructionFileManager = new InstructionFileManager(this.logger);
      this.environmentManager = new EnvironmentManager(this.logger);

      if (payload) {
        this.configureFromPayload(payload);
        await this.loadPayloadCredentials(payload);
      }

      await this.initializeCoreServices(
        payload?.callbackToken,
        payload?.platformApiUrl,
      );

      if (payload) {
        await this.agentAuthLifecycle.materializeFromEnvironment();
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

    try {
      const jobRunner = this.agentSessionId
        ? runSessionTurnJob
        : data.jobKind === "research"
          ? runResearchJob
          : data.jobKind === "planning"
            ? runPlanningJob
            : runCodingJob;

      return await jobRunner({
        data,
        repositoryRoot: this.workDir,
        logger: this.logger,
        gitService: this.gitService,
        callbackClient: this.callbackClient,
        orchestrator: this.orchestrator,
        instructionFileManager: this.instructionFileManager,
        instructionFiles: this.instructionFiles,
        fetchedCredentials: this.fetchedCredentials || {},
        clankerEnvironment: this.clankerEnvironment,
        clankerConfig: this.clankerConfig,
        projectConfig: this.projectConfig,
        overrides: this.overrides,
        agentAuthLifecycle: this.agentAuthLifecycle,
        environmentManager: this.environmentManager,
        logForwarder: this.logForwarder,
        defaultTimeout: this.config.execution.defaultTimeout,
        agentSessionId: this.agentSessionId,
        agentTurnId: this.agentTurnId,
        acpSessionId: this.acpSessionId,
        sessionMode: this.sessionMode,
        sessionEventForwarder: this.sessionEventForwarder,
        selectAgentForExecution: (availableAgents) =>
          this.selectAgentForExecution(availableAgents),
        sendProgress: (step, message, details) =>
          sendWorkerProgress(
            this.callbackClient,
            this.logger,
            this.currentJobId,
            this.currentTenantId,
            step,
            message,
            details,
          ),
        cloneRepositoryToWorkspace: (repository, branch, workDir) =>
          this.cloneRepositoryToWorkspace(repository, branch, workDir),
      });
    } finally {
      // Cleanup runs after sendResult has already been called inside jobRunner,
      // so Lambda timeout during cleanup no longer causes the job to appear
      // stuck as "running" on the platform.
      this.logForwarder.cleanup();
      this.sessionEventForwarder.cleanup();
      this.environmentManager.cleanup(
        this.fetchedCredentials || {},
        this.clankerEnvironment,
      );
      cleanupJobWorkspace(this.logger, path.join(this.workDir, data.id));
      this.currentJobId = undefined;
      this.currentTenantId = undefined;
    }
  }

  private configureFromPayload(payload: WorkerPayload): void {
    this.clankerConfig = resolveClankerConfig(payload);

    const payloadAgent = normalizeAgentName(payload.agent);
    if (payloadAgent) {
      this.requestedAgent = payloadAgent;
    } else {
      const clankerAgent = normalizeAgentName(this.clankerConfig?.agent);
      if (clankerAgent) {
        this.requestedAgent = clankerAgent;
      }
    }

    const endpointEnvironment = this.agentEndpointEnvironmentFactory
      .create({
        requestedAgent: this.requestedAgent,
        clankerConfig: this.clankerConfig,
      })
      .resolve();
    this.clankerEnvironment = extractClankerEnvironment(
      this.clankerConfig,
      endpointEnvironment,
    );

    this.projectConfig = payload.projectConfig;
    this.overrides = payload.overrides;
    this.agentSessionId = payload.agentSessionId;
    this.agentTurnId = payload.agentTurnId;
    this.sessionMode = payload.sessionMode;
    this.acpSessionId = payload.acpSessionId;
  }

  private async loadPayloadCredentials(payload: WorkerPayload): Promise<void> {
    const credentials = await this.credentialProvider.getCredentials(
      payload.tenantId,
      payload.requiredCredentials || [],
    );
    this.fetchedCredentials = credentials;

    this.credentialProvider.validateRequired(
      credentials,
      payload.requiredCredentials || [],
    );

    this.environmentManager.inject(credentials, this.clankerEnvironment);
  }

  private async initializeCoreServices(
    callbackToken?: string,
    platformApiUrl?: string,
  ): Promise<void> {
    const configManager = new ConfigManager(this.logger);
    this.config = await configManager.loadConfiguration();
    this.logger.level = this.config.logging.level;

    const agentConfigs = configManager.getAgentConfigs();
    const acpExecutor = new AcpExecutor(this.logger);
    this.orchestrator = new AgentOrchestrator(
      agentConfigs,
      this.logger,
      configManager,
      acpExecutor,
    );
    this.gitService = new GitService(this.logger, this.config.git);

    this.callbackClient = new CallbackClient(this.logger, {
      platformUrl: platformApiUrl || process.env.PLATFORM_API_URL,
      maxRetries: 3,
      retryDelay: 1000,
      callbackToken,
    });

    this.logForwarder = new LogForwarder(this.logger, this.callbackClient);
    this.sessionEventForwarder = new SessionEventForwarder(
      this.callbackClient,
      this.logger,
    );
    this.agentAuthLifecycle = this.agentAuthLifecycleFactory.create({
      requestedAgent: this.requestedAgent,
      clankerConfig: this.clankerConfig,
      logger: this.logger,
      callbackClient: this.callbackClient,
      workDir: this.workDir,
      sendProgress: (step, message, details) =>
        sendWorkerProgress(
          this.callbackClient,
          this.logger,
          this.currentJobId,
          this.currentTenantId,
          step,
          message,
          details,
        ),
      credentialProvider: this.credentialProvider,
    });
  }

  private selectAgentForExecution(availableAgents: AgentConfig[]): AgentConfig {
    if (availableAgents.length === 0) {
      throw new Error("No agents available");
    }

    const requestedAgent = this.requestedAgent || process.env.DEFAULT_AGENT;
    const normalizedRequestedAgent = normalizeAgentName(requestedAgent);

    if (!normalizedRequestedAgent) {
      return availableAgents[0];
    }

    const matchedAgent = availableAgents.find(
      (agent) => agent.name === normalizedRequestedAgent,
    );

    if (matchedAgent) {
      return matchedAgent;
    }

    this.logger.warn(
      "Requested agent is not configured in worker, falling back",
      {
        requestedAgent: normalizedRequestedAgent,
        fallbackAgent: availableAgents[0].name,
      },
    );
    return availableAgents[0];
  }

  private async cloneRepositoryToWorkspace(
    repository: string,
    branch: string,
    workDir: string,
  ): Promise<string> {
    const repoDir = path.join(workDir, "repo");

    if (fs.existsSync(repoDir)) {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }

    await this.gitService.cloneRepository(repository, branch, workDir);
    return repoDir;
  }
}
