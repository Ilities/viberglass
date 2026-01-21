import {
  SSMClient,
  GetParametersCommand,
  GetParametersByPathCommand,
} from "@aws-sdk/client-ssm";
import { Configuration, AgentConfig } from "../types";
import { Logger } from "winston";
import * as dotenv from "dotenv";

export class ConfigManager {
  private ssmClient?: SSMClient;
  private logger: Logger;
  private config: Configuration;

  constructor(logger: Logger) {
    this.logger = logger;

    // Load environment variables
    dotenv.config();

    // Initialize AWS SSM client if configured
    if (process.env.AWS_REGION) {
      this.ssmClient = new SSMClient({
        region: process.env.AWS_REGION,
      });
    }

    // Initialize default configuration
    this.config = this.loadDefaultConfiguration();
  }

  /**
   * Load configuration from environment variables and AWS SSM
   */
  async loadConfiguration(): Promise<Configuration> {
    this.logger.info("Loading configuration...");

    // Start with default configuration
    let config = this.loadDefaultConfiguration();

    // Override with environment variables
    config = this.applyEnvironmentVariables(config);

    // Override with AWS SSM parameters if configured
    if (this.ssmClient && process.env.SSM_PARAMETER_PATH) {
      config = await this.applySSMParameters(config);
    }

    this.config = config;
    this.logger.info("Configuration loaded successfully");

    return config;
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfiguration(): Configuration {
    return {
      agents: {
        "claude-code": {
          name: "claude-code",
          capabilities: [
            "python",
            "javascript",
            "typescript",
            "java",
            "go",
            "rust",
            "cpp",
          ],
          costPerExecution: 0.5,
          averageSuccessRate: 0.85,
          executionTimeLimit: 2700, // 45 minutes
          resourceLimits: {
            maxMemoryMB: 2048,
            maxCpuPercent: 80,
            maxDiskSpaceMB: 1024,
            maxNetworkRequests: 100,
          },
          maxTokens: 4000,
          temperature: 0.1,
        },
        "qwen-cli": {
          name: "qwen-cli",
          capabilities: ["python", "javascript", "typescript", "java", "cpp"],
          costPerExecution: 0.3,
          averageSuccessRate: 0.78,
          executionTimeLimit: 2400,
          resourceLimits: {
            maxMemoryMB: 1536,
            maxCpuPercent: 70,
            maxDiskSpaceMB: 512,
            maxNetworkRequests: 80,
          },
          maxTokens: 3000,
          temperature: 0.2,
        },
        "qwen-api": {
          name: "qwen-api",
          capabilities: [
            "python",
            "javascript",
            "typescript",
            "java",
            "cpp",
            "go",
            "rust",
          ],
          costPerExecution: 0.25, // Potentially cheaper than CLI
          averageSuccessRate: 0.8,
          executionTimeLimit: 1800, // 30 minutes for API calls
          resourceLimits: {
            maxMemoryMB: 1024,
            maxCpuPercent: 60,
            maxDiskSpaceMB: 256,
            maxNetworkRequests: 50,
          },
          maxTokens: 4000,
          temperature: 0.1,
        },
        codex: {
          name: "codex",
          capabilities: [
            "python",
            "javascript",
            "typescript",
            "java",
            "go",
            "cpp",
            "csharp",
          ],
          costPerExecution: 0.75,
          averageSuccessRate: 0.82,
          executionTimeLimit: 3000,
          resourceLimits: {
            maxMemoryMB: 2048,
            maxCpuPercent: 90,
            maxDiskSpaceMB: 1024,
            maxNetworkRequests: 120,
          },
          maxTokens: 8000,
          temperature: 0.0,
        },
        "mistral-vibe": {
          name: "mistral-vibe",
          capabilities: ["python", "javascript", "typescript", "rust", "go"],
          costPerExecution: 0.4,
          averageSuccessRate: 0.8,
          executionTimeLimit: 2400,
          resourceLimits: {
            maxMemoryMB: 1792,
            maxCpuPercent: 75,
            maxDiskSpaceMB: 768,
            maxNetworkRequests: 90,
          },
          maxTokens: 4000,
          temperature: 0.1,
        },
        "gemini-cli": {
          name: "gemini-cli",
          capabilities: [
            "python",
            "javascript",
            "typescript",
            "java",
            "kotlin",
            "swift",
          ],
          costPerExecution: 0.35,
          averageSuccessRate: 0.77,
          executionTimeLimit: 2100,
          resourceLimits: {
            maxMemoryMB: 1536,
            maxCpuPercent: 70,
            maxDiskSpaceMB: 512,
            maxNetworkRequests: 85,
          },
          maxTokens: 3500,
          temperature: 0.15,
        },
      },
      logging: {
        level: "info",
        format: "json",
      },
      execution: {
        maxConcurrentJobs: 3,
        defaultTimeout: 2700,
        retryAttempts: 2,
      },
    };
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentVariables(config: Configuration): Configuration {
    // Agent API keys
    Object.keys(config.agents).forEach((agentName) => {
      const envKey = `${agentName.toUpperCase().replace("-", "_")}_API_KEY`;
      if (process.env[envKey]) {
        config.agents[agentName].apiKey = process.env[envKey];
      }

      const endpointKey = `${agentName.toUpperCase().replace("-", "_")}_ENDPOINT`;
      if (process.env[endpointKey]) {
        config.agents[agentName].endpoint = process.env[endpointKey];
      }
    });

    // Special handling for qwen-api to check for dedicated API key
    if (process.env.QWEN_API_KEY && config.agents["qwen-api"]) {
      config.agents["qwen-api"].apiKey = process.env.QWEN_API_KEY;
    }
    if (process.env.QWEN_API_ENDPOINT && config.agents["qwen-api"]) {
      config.agents["qwen-api"].endpoint = process.env.QWEN_API_ENDPOINT;
    }

    // Logging configuration
    if (process.env.LOG_LEVEL) {
      config.logging.level = process.env.LOG_LEVEL as Configuration["logging"]["level"];
    }

    if (process.env.LOG_FORMAT) {
      config.logging.format = process.env.LOG_FORMAT as Configuration["logging"]["format"];
    }

    // Execution configuration
    if (process.env.MAX_CONCURRENT_JOBS) {
      config.execution.maxConcurrentJobs = parseInt(
        process.env.MAX_CONCURRENT_JOBS,
      );
    }

    if (process.env.DEFAULT_TIMEOUT) {
      config.execution.defaultTimeout = parseInt(process.env.DEFAULT_TIMEOUT);
    }

    if (process.env.RETRY_ATTEMPTS) {
      config.execution.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS);
    }

    // AWS configuration
    if (process.env.AWS_REGION && process.env.SSM_PARAMETER_PATH) {
      config.aws = {
        region: process.env.AWS_REGION,
        ssmParameterPath: process.env.SSM_PARAMETER_PATH,
      };
    }

    return config;
  }

  /**
   * Apply AWS SSM Parameter Store overrides
   */
  private async applySSMParameters(
    config: Configuration,
  ): Promise<Configuration> {
    if (!this.ssmClient || !config.aws?.ssmParameterPath) {
      return config;
    }

    try {
      this.logger.info("Loading configuration from AWS SSM", {
        path: config.aws.ssmParameterPath,
      });

      const command = new GetParametersByPathCommand({
        Path: config.aws.ssmParameterPath,
        Recursive: true,
        WithDecryption: true,
      });

      const response = await this.ssmClient.send(command);

      if (response.Parameters) {
        for (const param of response.Parameters) {
          if (!param.Name || !param.Value) continue;

          const paramName = param.Name.replace(
            config.aws.ssmParameterPath,
            "",
          ).replace(/^\//, "");

          // Parse parameter name and apply to config
          if (paramName.startsWith("agents/")) {
            const [, agentName, property] = paramName.split("/");
            if (config.agents[agentName]) {
              this.setNestedValue(
                config.agents[agentName],
                property,
                param.Value,
              );
            }
          } else if (paramName.startsWith("logging/")) {
            const property = paramName.replace("logging/", "");
            this.setNestedValue(config.logging, property, param.Value);
          } else if (paramName.startsWith("execution/")) {
            const property = paramName.replace("execution/", "");
            this.setNestedValue(config.execution, property, param.Value);
          }
        }
      }

      this.logger.info("AWS SSM parameters applied successfully");
    } catch (error) {
      this.logger.error("Failed to load AWS SSM parameters", { error });
      // Continue with existing config if SSM fails
    }

    return config;
  }

  /**
   * Set nested value in object
   */
  private setNestedValue(obj: any, path: string, value: string) {
    const keys = path.split(".");
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    const finalKey = keys[keys.length - 1];

    // Try to parse as number or boolean
    if (value === "true") {
      current[finalKey] = true;
    } else if (value === "false") {
      current[finalKey] = false;
    } else if (!isNaN(Number(value))) {
      current[finalKey] = Number(value);
    } else {
      current[finalKey] = value;
    }
  }

  /**
   * Get current configuration
   */
  getConfiguration(): Configuration {
    return this.config;
  }

  /**
   * Get agent configurations
   */
  getAgentConfigs(): AgentConfig[] {
    return Object.values(this.config.agents);
  }

  /**
   * Get specific agent configuration
   */
  getAgentConfig(name: string): AgentConfig | undefined {
    return this.config.agents[name];
  }

  /**
   * Validate configuration
   */
  validateConfiguration(): boolean {
    try {
      // Check required fields
      if (!this.config.agents || Object.keys(this.config.agents).length === 0) {
        throw new Error("No agents configured");
      }

      // Validate each agent
      for (const [name, agent] of Object.entries(this.config.agents)) {
        if (!agent.capabilities || agent.capabilities.length === 0) {
          throw new Error(`Agent ${name} has no capabilities defined`);
        }

        if (agent.costPerExecution < 0) {
          throw new Error(`Agent ${name} has invalid cost per execution`);
        }

        if (agent.averageSuccessRate < 0 || agent.averageSuccessRate > 1) {
          throw new Error(`Agent ${name} has invalid success rate`);
        }
      }

      this.logger.info("Configuration validation passed");
      return true;
    } catch (error) {
      this.logger.error("Configuration validation failed", { error });
      return false;
    }
  }
}
