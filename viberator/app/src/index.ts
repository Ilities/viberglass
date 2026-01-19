import { ConfigManager } from "./config/ConfigManager";
import { AgentOrchestrator } from "./orchestrator/AgentOrchestrator";
import { AgentFactory } from "./agents";
import { BugReport, Ticket, ProjectSettings, Configuration } from "./types";
import { createLogger, format, transports } from "winston";
import express, { Request, Response } from "express";

class VibugViberator {
  private config!: Configuration;
  private logger: any;
  private orchestrator!: AgentOrchestrator;
  private configManager!: ConfigManager;
  private app: express.Application;

  constructor() {
    // Initialize logger first
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      format:
        process.env.LOG_FORMAT === "text" ? format.simple() : format.json(),
      transports: [
        new transports.Console(),
        new transports.File({ filename: "vibug-viberator.log" }),
      ],
    });

    this.app = express();
    this.app.use(express.json());
  }

  async initialize(): Promise<void> {
    try {
      this.logger.info("Initializing Vibug Viberator...");

      // Initialize configuration manager
      this.configManager = new ConfigManager(this.logger);

      // Load configuration
      this.config = await this.configManager.loadConfiguration();

      // Validate configuration
      if (!this.configManager.validateConfiguration()) {
        throw new Error("Configuration validation failed");
      }

      // Update logger level based on config
      this.logger.level = this.config.logging.level;

      // Initialize orchestrator with agent configs
      const agentConfigs = this.configManager.getAgentConfigs();
      this.orchestrator = new AgentOrchestrator(agentConfigs, this.logger);

      // Setup API routes
      this.setupRoutes();

      this.logger.info("Vibug Viberator initialized successfully", {
        agents: agentConfigs.map((a) => a.name),
        maxConcurrentJobs: this.config.execution.maxConcurrentJobs,
      });
    } catch (error) {
      this.logger.error("Failed to initialize Vibug Viberator", { error });
      throw error;
    }
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        agents: this.orchestrator.getAvailableAgents().map((a) => ({
          name: a.name,
          capabilities: a.capabilities,
        })),
      });
    });

    // Execute bug fix endpoint
    this.app.post("/execute", async (req: Request, res: Response) => {
      try {
        const { bugReport, ticket, projectSettings } = req.body;

        // Validate required fields
        if (!bugReport || !projectSettings) {
          return res.status(400).json({
            error: "Missing required fields: bugReport and projectSettings",
          });
        }

        // Create default ticket if not provided
        const ticketData: Ticket = ticket || {
          id: `ticket_${Date.now()}`,
          priority: "medium",
          labels: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        // Execute bug fix
        const executionId = await this.executeBugFix(
          bugReport,
          ticketData,
          projectSettings,
        );

        res.json({
          executionId,
          status: "started",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("API execution failed", { error });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // Get execution status
    this.app.get("/execution/:id/status", (req: Request, res: Response) => {
      const { id } = req.params;
      const activeExecutions = this.orchestrator.getActiveExecutions();
      const execution = activeExecutions.find((e) => e.id === id);

      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }

      res.json({
        id: execution.id,
        status: execution.status,
        agentName: execution.agentName,
        startTime: execution.startTime,
        endTime: execution.endTime,
        result: execution.result,
      });
    });

    // List available agents
    this.app.get("/agents", (req: Request, res: Response) => {
      const agents = this.orchestrator.getAvailableAgents();
      res.json({
        agents: agents.map((agent) => ({
          name: agent.name,
          capabilities: agent.capabilities,
          costPerExecution: agent.costPerExecution,
          averageSuccessRate: agent.averageSuccessRate,
          executionTimeLimit: agent.executionTimeLimit,
        })),
      });
    });

    // Qwen Code specific execution endpoint
    this.app.post("/qwen/execute", async (req: Request, res: Response) => {
      try {
        const { prompt, context } = req.body;

        if (!prompt) {
          return res.status(400).json({
            error: "Missing required field: prompt",
          });
        }

        // Find the Qwen API agent, preferring the API version over CLI
        const qwenAgent =
          this.orchestrator
            .getAvailableAgents()
            .find((agent) => agent.name === "qwen-api") ||
          this.orchestrator
            .getAvailableAgents()
            .find((agent) => agent.name === "qwen-cli");

        if (!qwenAgent) {
          return res.status(404).json({
            error: "Qwen agent not available",
          });
        }

        // Prepare execution context
        const executionContext = {
          repoUrl: context?.repoUrl || "",
          branch: context?.branch || "main",
          commitHash: "",
          bugDescription: prompt,
          stepsToReproduce: context?.stepsToReproduce || "",
          expectedBehavior: context?.expectedBehavior || "",
          actualBehavior: context?.actualBehavior || "",
          stackTrace: context?.stackTrace,
          consoleErrors: context?.consoleErrors || [],
          affectedFiles: context?.affectedFiles || [],
          maxChanges: context?.maxChanges || 5,
          testRequired: context?.testRequired || false,
          codingStandards: context?.codingStandards,
          runTests: context?.runTests || false,
          testCommand: context?.testCommand || "npm test",
          maxExecutionTime:
            context?.maxExecutionTime || this.config.execution.defaultTimeout,
        };

        // Execute the Qwen agent directly
        const result = await this.orchestrator.executeAgent(
          qwenAgent,
          executionContext,
        );

        res.json({
          success: result.success,
          changedFiles: result.changedFiles,
          executionTime: result.executionTime,
          cost: result.cost,
          errorMessage: result.errorMessage,
        });
      } catch (error) {
        this.logger.error("Qwen API execution failed", { error });
        res.status(500).json({
          error:
            error instanceof Error ? error.message : "Internal server error",
        });
      }
    });

    // Get Qwen agent status
    this.app.get("/qwen/status", (req: Request, res: Response) => {
      const qwenAgent =
        this.orchestrator
          .getAvailableAgents()
          .find((agent) => agent.name === "qwen-api") ||
        this.orchestrator
          .getAvailableAgents()
          .find((agent) => agent.name === "qwen-cli");

      if (!qwenAgent) {
        return res.status(404).json({
          status: "unavailable",
          message: "Qwen agent not configured",
        });
      }

      res.json({
        status: "available",
        agent: {
          name: qwenAgent.name,
          capabilities: qwenAgent.capabilities,
          costPerExecution: qwenAgent.costPerExecution,
          averageSuccessRate: qwenAgent.averageSuccessRate,
        },
      });
    });
  }

  /**
   * Execute bug fix using the orchestrator
   */
  private async executeBugFix(
    bugReport: BugReport,
    ticket: Ticket,
    projectSettings: ProjectSettings,
  ): Promise<string> {
    try {
      // Select appropriate agent
      const selectedAgent = await this.orchestrator.selectAgent(
        bugReport,
        ticket,
        projectSettings,
      );

      this.logger.info("Agent selected for execution", {
        bugId: bugReport.id,
        agentName: selectedAgent.name,
      });

      // Prepare execution context
      const context = this.orchestrator.prepareExecutionContext(
        bugReport,
        ticket,
        projectSettings,
      );

      // Execute the agent
      const result = await this.orchestrator.executeAgent(
        selectedAgent,
        context,
      );

      this.logger.info("Bug fix execution completed", {
        bugId: bugReport.id,
        agentName: selectedAgent.name,
        success: result.success,
        executionTime: result.executionTime,
      });

      return `exec_${bugReport.id}_${selectedAgent.name}`;
    } catch (error) {
      this.logger.error("Bug fix execution failed", {
        bugId: bugReport.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    const port = process.env.PORT || 3000;

    this.app.listen(port, () => {
      this.logger.info(`Vibug Viberator server started on port ${port}`);
    });
  }

  /**
   * Run as CLI mode (single execution)
   */
  async runCLI(): Promise<void> {
    try {
      // Example bug report and project settings for CLI mode
      const bugReport: BugReport = {
        id: "cli_bug_001",
        title: "CLI Bug Fix",
        description: process.env.BUG_DESCRIPTION || "Sample bug description",
        stepsToReproduce:
          process.env.STEPS_TO_REPRODUCE || "Steps to reproduce the bug",
        expectedBehavior: process.env.EXPECTED_BEHAVIOR || "Expected behavior",
        actualBehavior: process.env.ACTUAL_BEHAVIOR || "Actual behavior",
        severity: (process.env.BUG_SEVERITY as any) || "medium",
        language: process.env.LANGUAGE || "javascript",
      };

      const projectSettings: ProjectSettings = {
        repoUrl: process.env.REPO_URL || "",
        branch: process.env.BRANCH || "main",
        testingRequired: process.env.TESTING_REQUIRED === "true",
      };

      if (!projectSettings.repoUrl) {
        throw new Error(
          "REPO_URL environment variable is required for CLI mode",
        );
      }

      const ticket: Ticket = {
        id: "cli_ticket_001",
        priority: "medium",
        labels: ["cli"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Execute bug fix
      await this.executeBugFix(bugReport, ticket, projectSettings);
    } catch (error) {
      this.logger.error("CLI execution failed", { error });
      process.exit(1);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const viberator = new VibugViberator();

  try {
    await viberator.initialize();

    // Check if running in CLI mode or server mode
    if (process.env.MODE === "cli") {
      await viberator.runCLI();
    } else {
      await viberator.start();
    }
  } catch (error) {
    console.error("Failed to start Vibug Viberator:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Start the application
if (require.main === module) {
  main().catch(console.error);
}

export { VibugViberator };
