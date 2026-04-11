import {
  AgentExecution,
  ExecutionContext,
  ExecutionResult,
} from "../types";
import type { BaseAgentConfig } from "@viberglass/agent-core";
import { Logger } from "winston";
import GitService from "../services/GitService";
import { ConfigManager } from "../config/ConfigManager";
import { randomUUID } from "crypto";
import type { AcpExecutor } from "./AcpExecutor";
import { agentRegistry } from "../agents/registerPlugins";

export class AgentOrchestrator {
  private agents: Map<string, BaseAgentConfig>;
  private activeExecutions: Map<string, AgentExecution>;
  private logger: Logger;
  private configManager: ConfigManager;
  private acpExecutor?: AcpExecutor;

  constructor(
    agentConfigs: BaseAgentConfig[],
    logger: Logger,
    configManager: ConfigManager,
    acpExecutor?: AcpExecutor,
  ) {
    this.agents = new Map();
    this.activeExecutions = new Map();
    this.logger = logger;
    this.configManager = configManager;
    this.acpExecutor = acpExecutor;

    // Initialize agents
    agentConfigs.forEach((config) => {
      this.agents.set(config.name, config);
    });
  }

  /**
   * Select a specific AI agent by identifier
   */
  async selectAgent(agentName: string): Promise<BaseAgentConfig> {
    this.logger.info("Selecting agent by identifier", { agentName });

    const selectedAgent = this.agents.get(agentName);
    if (!selectedAgent) {
      throw new Error(`Requested agent not available: ${agentName}`);
    }

    return selectedAgent;
  }

  /**
   * Execute agent with the given context
   */
  async executeAgent(
    agentConfig: BaseAgentConfig,
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

        const secretValues = await this.configManager.resolveSecrets(
          context.secrets,
        );

        // Inject secrets into environment
        Object.assign(process.env, secretValues);

        this.logger.info("Secrets resolved and injected into environment", {
          executionId,
          resolvedCount: Object.keys(secretValues).length,
        });
      }

      const prompt = context.promptOverride || this.buildAgentPrompt(context);
      const gitService = new GitService(this.logger, {
        userName: process.env.GIT_USER_NAME || "Vibes Viber",
        userEmail: process.env.GIT_USER_EMAIL || "viberator@viberglass.io",
      });
      const agent = agentRegistry().createAgent(effectiveAgentConfig, this.logger, gitService);

      // Execute the agent — via ACP if an interactive session is active, else one-shot
      const startTime = Date.now();
      let result: ExecutionResult;
      if (this.acpExecutor && context.agentSessionId) {
        const mapper = agentRegistry().getAcpEventMapper(effectiveAgentConfig.name);
        result = await this.acpExecutor.execute(agent, prompt, context, mapper);
      } else {
        result = await agent.execute(prompt, context);
      }
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
    const ticketMediaSection =
      context.ticketMedia && context.ticketMedia.length > 0
        ? `\nATTACHED MEDIA:\n${context.ticketMedia
            .map((media, index) => {
              const refs: string[] = [];
              if (media.mountPath) refs.push(`mountPath=${media.mountPath}`);
              if (media.accessUrl) refs.push(`accessUrl=${media.accessUrl}`);
              if (media.s3Url) refs.push(`s3Url=${media.s3Url}`);
              refs.push(`storage=${media.storageUrl}`);
              return `${index + 1}. ${media.kind} (${media.filename}, ${media.mimeType}) ${refs.join(" | ")}`;
            })
            .join("\n")}\n`
        : "";
    const researchSection =
      context.researchDocument?.trim() &&
      !context.bugDescription.includes(context.researchDocument.trim()) &&
      (!context.promptOverride ||
        !context.promptOverride.includes(context.researchDocument.trim()))
        ? `\nRESEARCH DOCUMENT:\n${context.researchDocument}\n`
        : "";
    const planningSection =
      context.planDocument?.trim() &&
      !context.bugDescription.includes(context.planDocument.trim()) &&
      (!context.promptOverride ||
        !context.promptOverride.includes(context.planDocument.trim()))
        ? `\nPLANNING DOCUMENT:\n${context.planDocument}\n`
        : "";

    if (context.jobKind === "claw") {
      return `
You are an expert software engineer. Complete the task described below.

TASK:
${context.bugDescription}
${ticketMediaSection}
${researchSection}
${planningSection}

REPOSITORY: ${context.repoUrl}
BRANCH: ${context.branch}

CONSTRAINTS:
- Make minimal, focused changes
${context.maxChanges ? `- Maximum ${context.maxChanges} files changed` : ""}
${context.testRequired ? "- Write tests for your changes" : ""}
${context.codingStandards ? `- Follow coding standards: ${context.codingStandards}` : ""}

INSTRUCTIONS:
0. Before making changes, read and follow AGENTS.md (if present), agents/AGENTS.md (if present), and relevant files under skills/ if present.
1. Analyze the task and the relevant parts of the codebase
2. Implement the task with minimal, focused changes
3. ${context.runTests ? "Run tests to verify your changes" : "Verify your changes manually"}

IMPORTANT: After completing the task, you MUST output pull request metadata files in the repository root:

1) \`PR_TITLE.md\` containing only the PR title on a single line.
   - Use a concise, specific title that describes what was done.
   - Prefer conventional commit style, for example: \`feat: add user export functionality\`

2) \`PR_DESCRIPTION.md\` using the following format:

\`\`\`markdown
## Summary
[Brief description of what this PR does]

## Changes Made
[List of key changes]

## Testing
[How the changes were verified]
\`\`\`

Please proceed with the task.
`;
    }

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
${ticketMediaSection}
${researchSection}
${planningSection}

REPOSITORY: ${context.repoUrl}
BRANCH: ${context.branch}

CONSTRAINTS:
- Make minimal, focused changes
${context.maxChanges ? `- Maximum ${context.maxChanges} files changed` : ""}
${context.testRequired ? "- Write tests for your fix" : ""}
${context.codingStandards ? `- Follow coding standards: ${context.codingStandards}` : ""}

INSTRUCTIONS:
0. Before making changes, read and follow AGENTS.md (if present), agents/AGENTS.md (if present), and relevant files under skills/ if present.
1. Clone the repository
2. Analyze the bug
3. Identify the root cause
4. Implement a minimal fix
5. ${context.runTests ? "Run tests to verify the fix" : "Verify the fix manually"}

IMPORTANT: After completing your fix, you MUST output pull request metadata files in the repository root:

1) \`PR_TITLE.md\` containing only the PR title on a single line.
   - Use a concise, specific title that describes the fix.
   - Prefer conventional commit style, for example: \`fix: improve pull request metadata generation\`

2) \`PR_DESCRIPTION.md\` using the following format:

\`\`\`markdown
## Summary
[Brief description of what this PR does]

## Problem
[Description of the bug/issue being fixed]

## Solution
[Explanation of how you fixed it]

## Changes Made
[List of key changes]

## Testing
[How the fix was verified]
\`\`\`

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
  getAvailableAgents(): BaseAgentConfig[] {
    return Array.from(this.agents.values());
  }
}
