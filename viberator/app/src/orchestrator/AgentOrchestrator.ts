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
import { randomUUID } from "crypto";

export class AgentOrchestrator {
  private agents: Map<string, AgentConfig>;
  private activeExecutions: Map<string, AgentExecution>;
  private logger: Logger;

  constructor(agentConfigs: AgentConfig[], logger: Logger) {
    this.agents = new Map();
    this.activeExecutions = new Map();
    this.logger = logger;

    // Initialize agents
    agentConfigs.forEach((config) => {
      this.agents.set(config.name, config);
    });
  }

  /**
   * Select the most appropriate AI agent based on bug report and project settings
   */
  async selectAgent(
    bugReport: BugReport,
    ticket: Ticket,
    projectSettings: ProjectSettings,
  ): Promise<AgentConfig> {
    this.logger.info("Selecting agent for bug report", { bugId: bugReport.id });

    const availableAgents = Array.from(this.agents.values());
    const scoredAgents = availableAgents.map((agent) => ({
      agent,
      score: this.calculateAgentScore(
        agent,
        bugReport,
        ticket,
        projectSettings,
      ),
    }));

    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);

    if (scoredAgents.length === 0) {
      throw new Error("No suitable agents available");
    }

    const selectedAgent = scoredAgents[0].agent;
    this.logger.info("Agent selected", {
      agentName: selectedAgent.name,
      score: scoredAgents[0].score,
    });

    return selectedAgent;
  }

  /**
   * Calculate agent score based on various factors
   */
  private calculateAgentScore(
    agent: AgentConfig,
    bugReport: BugReport,
    ticket: Ticket,
    projectSettings: ProjectSettings,
  ): number {
    let score = 0;

    // Language capability match (40% weight)
    if (agent.capabilities.includes(bugReport.language.toLowerCase())) {
      score += 40;
    }

    // Framework capability match (20% weight)
    if (
      bugReport.framework &&
      agent.capabilities.includes(bugReport.framework.toLowerCase())
    ) {
      score += 20;
    }

    // Success rate (20% weight)
    score += agent.averageSuccessRate * 20;

    // Cost efficiency (10% weight) - lower cost is better
    const maxCost = Math.max(
      ...Array.from(this.agents.values()).map((a) => a.costPerExecution),
    );
    score += (1 - agent.costPerExecution / maxCost) * 10;

    // User preference (10% weight)
    if (projectSettings.preferredAgents?.includes(agent.name)) {
      score += 10;
    }

    // Penalty for high severity bugs if agent has low success rate
    if (bugReport.severity === "critical" && agent.averageSuccessRate < 0.8) {
      score -= 15;
    }

    return Math.max(0, score);
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

    try {
      this.logger.info("Starting agent execution", {
        executionId,
        agentName: agentConfig.name,
      });

      execution.status = "running";

      // Generate prompt for the agent
      const prompt = this.buildAgentPrompt(context);

      // Instantiate the specific agent
      const agent = AgentFactory.createAgent(agentConfig, this.logger);

      // Execute the agent
      const startTime = Date.now();
      const result = await agent.execute(prompt, context);
      const executionTime = Date.now() - startTime;

      execution.status = "completed";
      execution.endTime = new Date();
      execution.result = {
        ...result,
        executionTime,
        cost: agentConfig.costPerExecution,
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
        cost: agentConfig.costPerExecution,
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
