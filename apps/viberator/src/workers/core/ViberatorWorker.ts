import { createLogger, format, transports, Logger } from "winston";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "../../config/ConfigManager";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
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
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { AgentAuthLifecycleFactory } from "./agentAuthLifecycleFactory";
import type { AgentEndpointEnvironmentFactory } from "./agentEndpointEnvironmentFactory";
import { runCodingJob } from "./runCodingJob";
import {
  extractClankerEnvironment,
  normalizeAgentName,
  resolveClankerConfig,
} from "./workerConfig";

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
  private agentAuthLifecycle!: AgentAuthLifecycle;
  private readonly agentAuthLifecycleFactory: AgentAuthLifecycleFactory;
  private readonly agentEndpointEnvironmentFactory: AgentEndpointEnvironmentFactory;
  private initialized = false;

  private clankerConfig?: Record<string, unknown>;
  private clankerEnvironment?: Record<string, string>;
  private requestedAgent?: string;
  private projectConfig?: ProjectConfigPayload;
  private overrides?: JobOverrides;
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

      this.credentialProvider = new CredentialProvider(this.logger);
      this.configLoader = new ConfigLoader(this.logger);
      this.instructionFileManager = new InstructionFileManager(this.logger);
      this.environmentManager = new EnvironmentManager(this.logger);

      if (payload) {
        this.configureFromPayload(payload);
        await this.loadPayloadCredentials(payload);
      }

      await this.initializeCoreServices(payload?.callbackToken);

      if (payload) {
        await this.agentAuthLifecycle.materializeFromEnvironment();
        this.instructionFiles = await this.instructionFileManager.loadFromPayload(
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
      return await runCodingJob({
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
        selectAgentForExecution: (availableAgents) =>
          this.selectAgentForExecution(availableAgents),
        sendProgress: (step, message, details) =>
          this.sendProgress(step, message, details),
        cloneRepositoryToWorkspace: (repository, branch, workDir) =>
          this.cloneRepositoryToWorkspace(repository, branch, workDir),
        cleanupWorkspace: (workDir) => this.cleanupWorkspace(workDir),
      });
    } finally {
      this.logForwarder.cleanup();
      this.environmentManager.cleanup(
        this.fetchedCredentials || {},
        this.clankerEnvironment,
      );
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

  private async initializeCoreServices(callbackToken?: string): Promise<void> {
    const configManager = new ConfigManager(this.logger);
    this.config = await configManager.loadConfiguration();
    this.logger.level = this.config.logging.level;

    const agentConfigs = configManager.getAgentConfigs();
    this.orchestrator = new AgentOrchestrator(
      agentConfigs,
      this.logger,
      configManager,
    );
    this.gitService = new GitService(this.logger, this.config.git);

    this.callbackClient = new CallbackClient(this.logger, {
      platformUrl: process.env.PLATFORM_API_URL,
      maxRetries: 3,
      retryDelay: 1000,
      callbackToken,
    });

    this.logForwarder = new LogForwarder(this.logger, this.callbackClient);
    this.agentAuthLifecycle = this.agentAuthLifecycleFactory.create({
      requestedAgent: this.requestedAgent,
      clankerConfig: this.clankerConfig,
      logger: this.logger,
      callbackClient: this.callbackClient,
      workDir: this.workDir,
      sendProgress: (step, message, details) =>
        this.sendProgress(step, message, details),
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

    this.logger.warn("Requested agent is not configured in worker, falling back", {
      requestedAgent: normalizedRequestedAgent,
      fallbackAgent: availableAgents[0].name,
    });
    return availableAgents[0];
  }

  private async sendProgress(
    step: string,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.currentJobId || !this.currentTenantId) {
      return;
    }

    try {
      await this.callbackClient.sendProgress(
        this.currentJobId,
        this.currentTenantId,
        {
          step,
          message,
          details,
        },
      );
    } catch (error) {
      this.logger.warn("Failed to send progress update", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  private cleanupWorkspace(workDir: string): void {
    try {
      if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
        this.logger.info("Workspace cleaned up", { workDir });
      }
    } catch (error) {
      this.logger.warn("Failed to cleanup workspace", { workDir, error });
    }
  }
}
