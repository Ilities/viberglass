import { createLogger, format, transports } from "winston";
import * as fs from "fs";
import * as path from "path";
import { ConfigManager } from "../config/ConfigManager";
import { AgentOrchestrator } from "../orchestrator/AgentOrchestrator";
import { Configuration, ExecutionContext } from "../types";
import { GitService } from "../services/GitService";
import { CodingJobData, JobResult } from "./types";

export class ViberatorWorker {
  private logger: any;
  private config!: Configuration;
  private orchestrator!: AgentOrchestrator;
  private workDir: string;
  private gitService!: GitService;
  private initialized: boolean = false;

  constructor() {
    // AWS Lambda only allows writing to /tmp
    this.workDir = process.env.WORK_DIR || "/tmp/viberator-work";

    this.logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: format.json(),
      transports: [new transports.Console()],
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.logger.info("Initializing Coding Worker for Lambda...");

      const configManager = new ConfigManager(this.logger);
      this.config = await configManager.loadConfiguration();
      this.logger.level = this.config.logging.level;

      const agentConfigs = configManager.getAgentConfigs();
      this.orchestrator = new AgentOrchestrator(agentConfigs, this.logger);
      this.gitService = new GitService(this.logger);

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

      return {
        success: true,
        branch: featureBranch,
        pullRequestUrl,
        changedFiles: result.changedFiles,
        executionTime,
        commitHash,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.logger.error("Task failed", {
        jobId: id,
        error: errorMessage,
        executionTime,
      });

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
