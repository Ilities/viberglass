import { createLogger, format, transports, Logger } from "winston";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "../config/ConfigManager";
import { AgentOrchestrator } from "../orchestrator/AgentOrchestrator";
import { Configuration, ExecutionContext } from "../types";
import { GitService } from "../services/GitService";
import {
  CodingJobData,
  JobResult,
  WorkerPayload,
  LambdaPayload,
  EcsPayload,
  DockerPayload,
  ProjectConfigPayload,
  JobOverrides,
} from "./types";
import { CallbackClient } from "./CallbackClient";
import { CredentialProvider } from "./CredentialProvider";
import { ConfigLoader } from "./ConfigLoader";
import { Writable } from "stream";

export class ViberatorWorker {
  private logger: Logger;
  private config!: Configuration;
  private orchestrator!: AgentOrchestrator;
  private workDir: string;
  private gitService!: GitService;
  private callbackClient!: CallbackClient;
  private initialized: boolean = false;
  private credentialProvider?: CredentialProvider;
  private configLoader?: ConfigLoader;
  private clankerConfig?: Record<string, unknown>;
  private projectConfig?: ProjectConfigPayload;
  private overrides?: JobOverrides;
  private instructionFiles: Map<string, string> = new Map();
  private fetchedCredentials?: Record<string, string | undefined>;
  private currentJobId?: string;
  private currentTenantId?: string;
  private logBuffer: string[] = [];
  private logBatch: Array<{
    level: "info" | "warn" | "error" | "debug";
    message: string;
    source: string;
  }> = [];
  private logBatchTimer?: NodeJS.Timeout;
  private readonly LOG_BATCH_SIZE = 10;
  private readonly LOG_BATCH_INTERVAL_MS = 2000;

  constructor() {
    // AWS Lambda only allows writing to /tmp
    this.workDir = process.env.WORK_DIR || "/tmp/viberator-work";

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: format.json(),
      transports: [new transports.Console()],
    });
  }

  async initialize(payload?: WorkerPayload): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info("Initializing Viberator Coding Worker...");

      // Initialize credential provider and config loader first
      this.credentialProvider = new CredentialProvider(this.logger);
      this.configLoader = new ConfigLoader(this.logger);

      // Process payload and fetch credentials BEFORE loading config
      // This ensures SSM credentials are in process.env when ConfigManager runs
      if (payload) {
        // Store deployment config based on worker type
        if (payload.workerType === "docker") {
          // DockerPayload uses clankerConfig
          this.clankerConfig = (payload as DockerPayload).clankerConfig;
        } else {
          // LambdaPayload and EcsPayload use deploymentConfig
          this.clankerConfig = (
            payload as LambdaPayload | EcsPayload
          ).deploymentConfig;
        }

        // Store project config and overrides for configuration merging
        this.projectConfig = payload.projectConfig;
        this.overrides = payload.overrides;

        // Fetch credentials from SSM
        const credentials = await this.credentialProvider.getCredentials(
          payload.tenantId,
          payload.requiredCredentials || [],
        );
        this.fetchedCredentials = credentials;

        // Validate required credentials
        this.credentialProvider.validateRequired(
          credentials,
          payload.requiredCredentials || [],
        );

        // Inject credentials into process.env BEFORE loading config
        // This allows ConfigManager to pick up SSM credentials (e.g., ANTHROPIC_API_KEY)
        this.injectEnvironmentVars(credentials);
      }

      // Now load config - it will pick up any SSM credentials from process.env
      const configManager = new ConfigManager(this.logger);
      this.config = await configManager.loadConfiguration();
      this.logger.level = this.config.logging.level;

      const agentConfigs = configManager.getAgentConfigs();
      this.orchestrator = new AgentOrchestrator(agentConfigs, this.logger);
      this.gitService = new GitService(this.logger);

      // Initialize callback client with callback token for authentication
      this.callbackClient = new CallbackClient(this.logger, {
        platformUrl: process.env.PLATFORM_API_URL,
        maxRetries: 3,
        retryDelay: 1000,
        callbackToken: payload?.callbackToken,
      });

      if (!fs.existsSync(this.workDir)) {
        fs.mkdirSync(this.workDir, { recursive: true });
      }

      // Continue processing payload if provided
      if (payload) {

        // Load instruction files based on worker type
        if (payload.workerType === "lambda" || payload.workerType === "ecs") {
          // AWS workers: fetch from S3 - S3InstructionFile has s3Url
          const awsPayload = payload as LambdaPayload | EcsPayload;
          const files = await this.configLoader.fetchInstructionFiles(
            awsPayload.instructionFiles.map((f) => ({
              fileType: f.fileType,
              s3Url: f.s3Url,
            })),
          );
          files.forEach((f) =>
            this.instructionFiles.set(f.fileType, f.content),
          );
        } else if (payload.workerType === "docker") {
          // Docker workers: use inline content if provided, else read from mounted filesystem
          const dockerPayload = payload as DockerPayload;
          for (const file of dockerPayload.instructionFiles) {
            try {
              if (file.content && file.content.trim().length > 0) {
                this.instructionFiles.set(file.fileType, file.content);
                continue;
              }

              if (file.mountPath && file.mountPath.trim().length > 0) {
                const content = fs.readFileSync(file.mountPath, "utf-8");
                this.instructionFiles.set(file.fileType, content);
                continue;
              }

              this.logger.debug("Skipping empty instruction file", {
                fileType: file.fileType,
              });
            } catch (error) {
              this.logger.warn("Failed to load instruction file", {
                fileType: file.fileType,
                path: file.mountPath,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        this.logger.info("Worker payload processed", {
          tenantId: payload.tenantId,
          workerType: payload.workerType,
          credentialsFetched: Object.keys(this.fetchedCredentials || {}).length,
          instructionFilesLoaded: this.instructionFiles.size,
        });
      }

      this.initialized = true;
      this.logger.info("Coding Worker initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Coding Worker", { error });
      throw error;
    }
  }

  private setupLogForwarding(jobId: string, tenantId: string): void {
    this.currentJobId = jobId;
    this.currentTenantId = tenantId;
    this.logBatch = [];

    const logStream = new Writable({
      write: (chunk: Buffer, encoding: string, callback: () => void) => {
        try {
          const message = chunk.toString();
          const logEntry = JSON.parse(message);
          const level = logEntry.level as "info" | "warn" | "error" | "debug";

          // Ensure message is always a string
          let logMessage: string;
          if (typeof logEntry.message === 'string') {
            logMessage = logEntry.message;
          } else if (logEntry.message !== undefined) {
            // If message is an object or other type, stringify it
            logMessage = JSON.stringify(logEntry.message);
          } else {
            // Fallback to raw message
            logMessage = message;
          }

          // Buffer the log for final result
          this.logBuffer.push(`[${level}] ${logMessage}`);

          // Add to batch
          this.logBatch.push({
            level,
            message: logMessage,
            source: "viberator",
          });

          // Flush if batch is full
          if (this.logBatch.length >= this.LOG_BATCH_SIZE) {
            this.flushLogBatch();
          } else if (!this.logBatchTimer) {
            // Schedule flush if timer not already running
            this.logBatchTimer = setTimeout(() => {
              this.flushLogBatch();
            }, this.LOG_BATCH_INTERVAL_MS);
          }
        } catch (error) {
          // If JSON parse fails, just buffer the raw message
          const message = chunk.toString();
          this.logBuffer.push(message);
        }
        callback();
      },
    });

    // Add a custom transport that batches logs before sending
    const callbackTransport = new transports.Stream({
      stream: logStream,
    });

    this.logger.add(callbackTransport);
  }

  private flushLogBatch(): void {
    if (this.logBatchTimer) {
      clearTimeout(this.logBatchTimer);
      this.logBatchTimer = undefined;
    }

    if (this.logBatch.length === 0) return;

    const batch = [...this.logBatch];
    this.logBatch = [];

    // Send batch to platform (non-blocking)
    if (this.callbackClient && this.currentJobId && this.currentTenantId) {
      this.callbackClient
        .sendLogBatch(this.currentJobId, this.currentTenantId, batch)
        .catch((error) => {
          // Silently fail - don't let log forwarding break the job
          console.error("Failed to forward log batch:", error);
        });
    }
  }

  private async sendProgress(
    step: string,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    if (this.callbackClient && this.currentJobId && this.currentTenantId) {
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
  }

  /**
   * Merge configuration settings with precedence: override > project > clanker > job settings
   */
  private getMergedSettings(jobSettings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  }): {
    maxChanges: number;
    testRequired: boolean;
    codingStandards?: string;
    runTests: boolean;
    testCommand: string;
    maxExecutionTime: number;
  } {
    const clankerSettings =
      (this.clankerConfig?.settings as typeof jobSettings) || {};
    const projectSettings = this.projectConfig?.workerSettings || {};
    const overrideSettings = this.overrides?.settings || {};

    return {
      maxChanges:
        overrideSettings.maxChanges ??
        projectSettings.maxChanges ??
        clankerSettings.maxChanges ??
        jobSettings?.maxChanges ??
        5,
      testRequired:
        overrideSettings.testRequired ??
        projectSettings.testRequired ??
        clankerSettings.testRequired ??
        jobSettings?.testRequired ??
        false,
      codingStandards:
        overrideSettings.codingStandards ??
        projectSettings.codingStandards ??
        clankerSettings.codingStandards ??
        jobSettings?.codingStandards,
      runTests:
        overrideSettings.runTests ??
        projectSettings.runTests ??
        clankerSettings.runTests ??
        jobSettings?.runTests ??
        false,
      testCommand:
        overrideSettings.testCommand ??
        projectSettings.testCommand ??
        clankerSettings.testCommand ??
        jobSettings?.testCommand ??
        "npm test",
      maxExecutionTime:
        overrideSettings.maxExecutionTime ??
        projectSettings.maxExecutionTime ??
        clankerSettings.maxExecutionTime ??
        jobSettings?.maxExecutionTime ??
        this.config.execution.defaultTimeout,
    };
  }

  async executeTask(data: CodingJobData): Promise<JobResult> {
    const startTime = Date.now();
    const { id, repository, task, baseBranch, context, settings } = data;

    // Setup log forwarding for this job
    this.setupLogForwarding(id, data.tenantId);
    this.logBuffer = [];

    this.logger.info("Processing task", { jobId: id, repository });
    await this.sendProgress("initialize", "Starting job execution");

    // Inject credentials into environment for GitService authentication
    // This must happen before any git operations (clone, push, etc.)
    this.injectEnvironmentVars(this.fetchedCredentials || {});

    try {
      const jobWorkDir = path.join(this.workDir, id);
      if (!fs.existsSync(jobWorkDir)) {
        fs.mkdirSync(jobWorkDir, { recursive: true });
      }

      await this.sendProgress("clone", "Cloning repository", { repository });
      this.logger.info("Cloning repository", { repository, jobWorkDir });
      const repoDir = await this.cloneRepositoryToWorkspace(
        repository,
        baseBranch || "main",
        jobWorkDir,
      );

      await this.sendProgress("branch", "Creating feature branch");
      const featureBranch = `fix/${id}`;
      await this.gitService.createBranch(repoDir, featureBranch);

      // Merge settings with precedence: override > project > clanker > job
      const mergedSettings = this.getMergedSettings(settings);

      // Build task description with additional context from overrides
      let fullTask = task;
      if (this.overrides?.additionalContext) {
        fullTask += `\n\nAdditional Context:\n${this.overrides.additionalContext}`;
      }

      // Use override reproduction steps if provided, otherwise use context
      const stepsToReproduce =
        this.overrides?.reproductionSteps || context?.stepsToReproduce || "";

      // Use override expected behavior if provided, otherwise use context
      const expectedBehavior =
        this.overrides?.expectedBehavior || context?.expectedBehavior || "";

      const executionContext: ExecutionContext = {
        repoUrl: repository,
        branch: featureBranch,
        baseBranch: baseBranch || "main",
        repoDir: repoDir,
        commitHash: "",
        bugDescription: fullTask,
        stepsToReproduce,
        expectedBehavior,
        actualBehavior: context?.actualBehavior || "",
        stackTrace: context?.stackTrace,
        consoleErrors: context?.consoleErrors || [],
        affectedFiles: context?.affectedFiles || [],
        maxChanges: mergedSettings.maxChanges,
        testRequired: mergedSettings.testRequired,
        codingStandards: mergedSettings.codingStandards,
        runTests: mergedSettings.runTests,
        testCommand: mergedSettings.testCommand,
        maxExecutionTime: mergedSettings.maxExecutionTime,
      };

      const availableAgents = this.orchestrator.getAvailableAgents();
      if (availableAgents.length === 0) {
        throw new Error("No agents available");
      }
      const selectedAgent = availableAgents[0];

      await this.sendProgress("execute", "Running AI agent", {
        agentName: selectedAgent.name,
      });
      this.logger.info("Agent selected", { agentName: selectedAgent.name });
      const result = await this.orchestrator.executeAgent(
        selectedAgent,
        executionContext,
      );

      if (!result.success) {
        throw new Error(result.errorMessage || "Agent execution failed");
      }

      await this.sendProgress("commit", "Committing changes");
      const commitHash = await this.gitService.commitChanges(repoDir, task);

      await this.sendProgress("push", "Pushing branch to remote");
      await this.gitService.pushBranch(repoDir, featureBranch);

      await this.sendProgress("pr", "Creating pull request");
      const pullRequestUrl = await this.gitService.createPullRequest(
        repoDir,
        featureBranch,
        baseBranch || "main",
        task,
        result.pullRequestDescription,
      );

      await this.sendProgress("cleanup", "Cleaning up workspace");
      this.cleanupWorkspace(jobWorkDir);

      const executionTime = Date.now() - startTime;
      this.logger.info("Task completed successfully", {
        jobId: id,
        executionTime,
        pullRequestUrl,
      });

      await this.sendProgress("complete", "Job completed successfully");

      // Flush any remaining logs before completing
      this.flushLogBatch();

      const workerResult: JobResult = {
        success: true,
        branch: featureBranch,
        pullRequestUrl,
        changedFiles: result.changedFiles,
        executionTime,
        commitHash,
      };

      // Send result to platform (non-blocking for worker flow)
      try {
        await this.callbackClient.sendResult(id, data.tenantId, {
          ...workerResult,
          logs: this.logBuffer,
        });
      } catch (callbackError) {
        this.logger.warn("Failed to send result to platform", {
          jobId: id,
          error:
            callbackError instanceof Error
              ? callbackError.message
              : String(callbackError),
        });
        // Don't throw - callback failure shouldn't fail the worker
      }

      return workerResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await this.sendProgress("failed", "Job failed", { error: errorMessage });
      this.logger.error("Task failed", {
        jobId: id,
        error: errorMessage,
        executionTime,
      });

      // Flush any remaining logs before failing
      this.flushLogBatch();

      // Send failure result to platform
      try {
        await this.callbackClient.sendResult(id, data.tenantId, {
          success: false,
          executionTime,
          errorMessage,
          logs: this.logBuffer,
          changedFiles: [],
        });
      } catch (callbackError) {
        this.logger.warn("Failed to send failure result to platform", {
          jobId: id,
          error:
            callbackError instanceof Error
              ? callbackError.message
              : String(callbackError),
        });
        // Don't throw - callback failure shouldn't fail the worker
      }

      return {
        success: false,
        changedFiles: [],
        executionTime,
        errorMessage,
      };
    } finally {
      // Flush any final logs and clean up
      this.flushLogBatch();
      if (this.logBatchTimer) {
        clearTimeout(this.logBatchTimer);
        this.logBatchTimer = undefined;
      }

      // Clean up injected credentials to prevent leakage
      this.cleanupEnvironmentVars(this.fetchedCredentials || {});

      // Clear job context
      this.currentJobId = undefined;
      this.currentTenantId = undefined;
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

  /**
   * Transform credential key to environment variable name
   * Converts lowercase/kebab-case to UPPERCASE_WITH_UNDERSCORES
   * Example: github_token -> GITHUB_TOKEN
   */
  private keyToEnvVar(key: string): string {
    return key.toUpperCase().replace(/-/g, "_");
  }

  /**
   * Inject credentials into process.env for GitService authentication
   * GitService uses SCMAuthFactory which reads from environment variables
   */
  private injectEnvironmentVars(
    credentials: Record<string, string | undefined>,
  ): void {
    // Inject each credential as an environment variable
    for (const [key, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        const envKey = this.keyToEnvVar(key);
        process.env[envKey] = value;
        this.logger.debug("Injected credential into environment", { envKey });
      }
    }

    // Inject clankerConfig environment variables if present
    if (this.clankerConfig?.environment) {
      const envConfig = this.clankerConfig.environment as Record<
        string,
        string
      >;
      for (const [key, value] of Object.entries(envConfig)) {
        process.env[key] = value;
        this.logger.debug("Injected clanker config environment variable", {
          key,
        });
      }
    }
  }

  /**
   * Remove injected credentials from process.env to prevent leakage
   */
  private cleanupEnvironmentVars(
    credentials: Record<string, string | undefined>,
  ): void {
    // Remove each credential from environment
    for (const [key, value] of Object.entries(credentials)) {
      if (value !== undefined) {
        const envKey = this.keyToEnvVar(key);
        delete process.env[envKey];
        this.logger.debug("Cleaned up credential from environment", { envKey });
      }
    }

    // Clean up clankerConfig environment variables if we tracked them
    if (this.clankerConfig?.environment) {
      const envConfig = this.clankerConfig.environment as Record<
        string,
        string
      >;
      for (const key of Object.keys(envConfig)) {
        delete process.env[key];
        this.logger.debug("Cleaned up clanker config environment variable", {
          key,
        });
      }
    }
  }
}
