import { createLogger, format, transports } from "winston";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "../config/ConfigManager";
import { AgentOrchestrator } from "../orchestrator/AgentOrchestrator";
import { Configuration, ExecutionContext } from "../types";
import { GitService } from "../services/GitService";
import { CodingJobData, JobResult, WorkerPayload } from "./types";
import { CallbackClient } from "./CallbackClient";
import { CredentialProvider } from "./CredentialProvider";
import { ConfigLoader } from "./ConfigLoader";

export class ViberatorWorker {
  private logger: any;
  private config!: Configuration;
  private orchestrator!: AgentOrchestrator;
  private workDir: string;
  private gitService!: GitService;
  private callbackClient!: CallbackClient;
  private initialized: boolean = false;
  private credentialProvider?: CredentialProvider;
  private configLoader?: ConfigLoader;
  private clankerConfig?: Record<string, unknown>;
  private instructionFiles: Map<string, string> = new Map();
  private fetchedCredentials?: Record<string, string | undefined>;

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
      this.logger.info("Initializing Coding Worker for Lambda...");

      const configManager = new ConfigManager(this.logger);
      this.config = await configManager.loadConfiguration();
      this.logger.level = this.config.logging.level;

      // Initialize credential provider and config loader
      this.credentialProvider = new CredentialProvider(this.logger);
      this.configLoader = new ConfigLoader(this.logger);

      const agentConfigs = configManager.getAgentConfigs();
      this.orchestrator = new AgentOrchestrator(agentConfigs, this.logger);
      this.gitService = new GitService(this.logger);

      // Initialize callback client
      this.callbackClient = new CallbackClient(this.logger, {
        platformUrl: process.env.PLATFORM_API_URL,
        maxRetries: 3,
        retryDelay: 1000,
      });

      if (!fs.existsSync(this.workDir)) {
        fs.mkdirSync(this.workDir, { recursive: true });
      }

      // Process payload if provided
      if (payload) {
        // Store deployment config based on worker type
        if (payload.workerType === 'docker') {
          // DockerPayload uses clankerConfig
          this.clankerConfig = (payload as any).clankerConfig;
        } else {
          // LambdaPayload and EcsPayload use deploymentConfig
          this.clankerConfig = (payload as any).deploymentConfig;
        }

        // Fetch credentials from SSM
        const credentials = await this.credentialProvider.getCredentials(
          payload.tenantId,
          payload.requiredCredentials || []
        );
        this.fetchedCredentials = credentials;

        // Validate required credentials
        this.credentialProvider.validateRequired(
          credentials,
          payload.requiredCredentials || []
        );

        // Load instruction files based on worker type
        if (payload.workerType === 'lambda' || payload.workerType === 'ecs') {
          // AWS workers: fetch from S3 - S3InstructionFile has s3Url
          const awsPayload = payload as any; // LambdaPayload/EcsPayload have s3Url
          const files = await this.configLoader.fetchInstructionFiles(
            awsPayload.instructionFiles.map((f: { fileType: string; s3Url: string }) => ({
              fileType: f.fileType,
              s3Url: f.s3Url
            }))
          );
          files.forEach(f => this.instructionFiles.set(f.fileType, f.content));
        } else if (payload.workerType === 'docker') {
          // Docker workers: read from mounted filesystem
          const dockerPayload = payload as any; // DockerPayload has mountPath
          for (const file of dockerPayload.instructionFiles) {
            try {
              const content = fs.readFileSync(file.mountPath, 'utf-8');
              this.instructionFiles.set(file.fileType, content);
            } catch (error) {
              this.logger.warn('Failed to read mounted config file', {
                path: file.mountPath,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }

        this.logger.info("Worker payload processed", {
          tenantId: payload.tenantId,
          workerType: payload.workerType,
          credentialsFetched: Object.keys(credentials).length,
          instructionFilesLoaded: this.instructionFiles.size
        });
      }

      this.initialized = true;
      this.logger.info("Coding Worker initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Coding Worker", { error });
      throw error;
    }
  }

  async executeTask(data: CodingJobData): Promise<JobResult> {
    const startTime = Date.now();
    const { id, repository, task, baseBranch, context, settings } = data;

    this.logger.info("Processing task", { jobId: id, repository });

    try {
      const jobWorkDir = path.join(this.workDir, id);
      if (!fs.existsSync(jobWorkDir)) {
        fs.mkdirSync(jobWorkDir, { recursive: true });
      }

      this.logger.info("Cloning repository", { repository, jobWorkDir });
      const repoDir = await this.cloneRepositoryToWorkspace(
        repository,
        baseBranch || "main",
        jobWorkDir,
      );

      const featureBranch = `fix/${id}`;
      await this.gitService.createBranch(repoDir, featureBranch);

      const executionContext: ExecutionContext = {
        repoUrl: repository,
        branch: featureBranch,
        baseBranch: baseBranch || "main",
        repoDir: repoDir,
        commitHash: "",
        bugDescription: task,
        stepsToReproduce: context?.stepsToReproduce || "",
        expectedBehavior: context?.expectedBehavior || "",
        actualBehavior: context?.actualBehavior || "",
        stackTrace: context?.stackTrace,
        consoleErrors: context?.consoleErrors || [],
        affectedFiles: context?.affectedFiles || [],
        maxChanges: settings?.maxChanges || 5,
        testRequired: settings?.testRequired || false,
        codingStandards: settings?.codingStandards,
        runTests: settings?.runTests || false,
        testCommand: settings?.testCommand || "npm test",
        maxExecutionTime:
          settings?.maxExecutionTime || this.config.execution.defaultTimeout,
      };

      const availableAgents = this.orchestrator.getAvailableAgents();
      if (availableAgents.length === 0) {
        throw new Error("No agents available");
      }
      const selectedAgent = availableAgents[0];

      this.logger.info("Agent selected", { agentName: selectedAgent.name });
      const result = await this.orchestrator.executeAgent(
        selectedAgent,
        executionContext,
      );

      if (!result.success) {
        throw new Error(result.errorMessage || "Agent execution failed");
      }

      const commitHash = await this.gitService.commitChanges(repoDir, task);
      await this.gitService.pushBranch(repoDir, featureBranch);

      const pullRequestUrl = await this.gitService.createPullRequest(
        repoDir,
        featureBranch,
        baseBranch || "main",
        task,
      );

      this.cleanupWorkspace(jobWorkDir);

      const executionTime = Date.now() - startTime;
      this.logger.info("Task completed successfully", {
        jobId: id,
        executionTime,
        pullRequestUrl,
      });

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
          logs: [],  // TODO: collect execution logs
        });
      } catch (callbackError) {
        this.logger.warn('Failed to send result to platform', {
          jobId: id,
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        });
        // Don't throw - callback failure shouldn't fail the worker
      }

      return workerResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.logger.error("Task failed", {
        jobId: id,
        error: errorMessage,
        executionTime,
      });

      // Send failure result to platform
      try {
        await this.callbackClient.sendResult(id, data.tenantId, {
          success: false,
          executionTime,
          errorMessage,
          logs: [],  // TODO: collect execution logs
          changedFiles: [],
        });
      } catch (callbackError) {
        this.logger.warn('Failed to send failure result to platform', {
          jobId: id,
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        });
        // Don't throw - callback failure shouldn't fail the worker
      }

      return {
        success: false,
        changedFiles: [],
        executionTime,
        errorMessage,
      };
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
