import {
  AgentConfig,
  BugReport,
  Ticket,
  ProjectSettings,
  ExecutionContext,
  AgentExecution,
  ExecutionResult,
  ResourceUsage,
} from "../types";
import { Logger } from "winston";
import { AgentFactory } from "../agents/AgentFactory";
import { ConfigManager } from "../config/ConfigManager";
import { randomUUID } from "crypto";

export class AgentOrchestrator {
  private agents: Map<string, AgentConfig>;
  private activeExecutions: Map<string, AgentExecution>;
  private logger: Logger;
  private configManager: ConfigManager;

  constructor(agentConfigs: AgentConfig[], logger: Logger, configManager: ConfigManager) {
    this.agents = new Map();
    this.activeExecutions = new Map();
    this.logger = logger;
    this.configManager = configManager;

    // Initialize agents
    agentConfigs.forEach((config) => {
      this.agents.set(config.name, config);
    });
  }

  /**
   * Select a specific AI agent by identifier
   */
  async selectAgent(agentName: AgentConfig["name"]): Promise<AgentConfig> {
    this.logger.info("Selecting agent by identifier", { agentName });

    const selectedAgent = this.agents.get(agentName);
    if (!selectedAgent) {
      throw new Error(`Requested agent not available: ${agentName}`);
    }

    return selectedAgent;
  }

  /**
   * Prepare execution context for the selected agent
   */
  prepareExecutionContext(
    bugReport: BugReport,
    ticket: Ticket,
    projectSettings: ProjectSettings,
  ): ExecutionContext {
    return {
      // Repository
      repoUrl: projectSettings.repoUrl,
      branch: projectSettings.branch,
      baseBranch: projectSettings.branch,
      commitHash: "", // Will be set during execution

      // Bug information
      bugDescription: bugReport.description,
      stepsToReproduce: bugReport.stepsToReproduce,
      expectedBehavior: bugReport.expectedBehavior,
      actualBehavior: bugReport.actualBehavior,

      // Technical context
      stackTrace: bugReport.stackTrace,
      consoleErrors: bugReport.consoleErrors,
      affectedFiles: bugReport.affectedFiles,

      // Constraints
      maxChanges: 5, // Default max changes
      testRequired: projectSettings.testingRequired,
      codingStandards: projectSettings.codingStandards,

      // CI/CD
      runTests: projectSettings.testingRequired,
      testCommand: "npm test", // Default test command

      // Timeout
      maxExecutionTime: projectSettings.timeLimit || 2700, // 45 minutes default
    };
  }

  /**
   * Execute agent with the given context
   */
  async executeAgent(
    agentConfig: AgentConfig,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const executionId = `exec_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const execution: AgentExecution = {
      id: executionId,
      agentName: agentConfig.name,
      startTime: new Date(),
      status: "pending",
      logs: [],
      resourceUsage: {
        memoryUsed: 0,
        cpuTime: 0,
        networkRequests: 0,
        diskSpaceUsed: 0,
      },
    };

    this.activeExecutions.set(executionId, execution);

    // Use agent from context if provided, otherwise use passed agentConfig
    let effectiveAgentConfig = agentConfig;
    if (context.agent) {
      this.logger.info("Using agent from context", {
        executionId,
        agent: context.agent,
      });
      effectiveAgentConfig = this.configManager.loadAgentConfig(context.agent);
    }

    try {
      this.logger.info("Starting agent execution", {
        executionId,
        agentName: effectiveAgentConfig.name,
      });

      execution.status = "running";

      // Resolve secrets if provided
      if (context.secrets && context.secrets.length > 0) {
        this.logger.info("Resolving secrets for execution", {
          executionId,
          secretCount: context.secrets.length,
        });

        const secretValues =
          await this.configManager.resolveSecrets(context.secrets);

        // Inject secrets into environment
        Object.assign(process.env, secretValues);

        this.logger.info("Secrets resolved and injected into environment", {
          executionId,
          resolvedCount: Object.keys(secretValues).length,
        });
      }

      // Generate prompt for the agent
      const prompt = this.buildAgentPrompt(context);

      // Instantiate the specific agent
      const agent = AgentFactory.createAgent(effectiveAgentConfig, this.logger);

      // Execute the agent
      const startTime = Date.now();
      const result = await agent.execute(prompt, context);
      const executionTime = Date.now() - startTime;

      execution.status = "completed";
      execution.endTime = new Date();
      execution.result = {
        ...result,
        executionTime,
        cost: effectiveAgentConfig.costPerExecution,
      };

      this.logger.info("Agent execution completed", {
        executionId,
        success: result.success,
      });

      return execution.result;
    } catch (error) {
      execution.status = "failed";
      execution.endTime = new Date();

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Agent execution failed", {
        executionId,
        error: errorMessage,
      });

      return {
        success: false,
        changedFiles: [],
        errorMessage,
        executionTime: Date.now() - execution.startTime.getTime(),
        cost: effectiveAgentConfig.costPerExecution,
      };
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Build the prompt for the agent based on the issue description format
   */
  buildAgentPrompt(context: ExecutionContext): string {
    return `
You are an expert software engineer tasked with fixing a bug.

BUG DESCRIPTION:
${context.bugDescription}

STEPS TO REPRODUCE:
${context.stepsToReproduce}

EXPECTED BEHAVIOR:
${context.expectedBehavior}

ACTUAL BEHAVIOR:
${context.actualBehavior}

${context.stackTrace ? `STACK TRACE:\n${context.stackTrace}` : ""}

REPOSITORY: ${context.repoUrl}
BRANCH: ${context.branch}

CONSTRAINTS:
- Make minimal, focused changes
${context.maxChanges ? `- Maximum ${context.maxChanges} files changed` : ""}
${context.testRequired ? "- Write tests for your fix" : ""}
${context.codingStandards ? `- Follow coding standards: ${context.codingStandards}` : ""}

INSTRUCTIONS:
1. Clone the repository
2. Analyze the bug
3. Identify the root cause
4. Implement a minimal fix
5. ${context.runTests ? "Run tests to verify the fix" : "Verify the fix manually"}
6. Create a pull request with:
   - Clear commit message
   - Description of the fix
   - Testing evidence

Please proceed with fixing this bug.
`;
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): AgentExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get available agents
   */
  getAvailableAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }
}
