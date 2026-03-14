import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { DEFAULT_AGENT_TYPE } from "@viberglass/types";
import { AgentConfig, Configuration, SecretMetadata } from "../types";
import type { Logger } from "winston";
import * as dotenv from "dotenv";
import { DEFAULT_AGENT_CONFIGS, AGENT_ENV_ALIASES } from "./AgentDefaults";
import { SsmConfigLoader } from "./SsmConfigLoader";

export class ConfigManager {
  private ssmClient?: SSMClient;
  private ssmLoader?: SsmConfigLoader;
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
      if (!this.ssmLoader) {
        this.ssmLoader = new SsmConfigLoader(this.ssmClient, this.logger);
      }
      config = await this.ssmLoader.loadConfigOverrides(config);
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
      agents: structuredClone(DEFAULT_AGENT_CONFIGS),
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
        config.agents[agentName].apiKey = process.env[envKey]!;
      }

      const endpointKey = `${agentName.toUpperCase().replace("-", "_")}_ENDPOINT`;
      if (process.env[endpointKey]) {
        config.agents[agentName].endpoint = process.env[endpointKey];
      }
    });

    // Apply official environment variable aliases
    Object.entries(AGENT_ENV_ALIASES).forEach(([agentName, aliases]) => {
      const agent = config.agents[agentName];
      if (!agent) return;

      if (!agent.apiKey && aliases.apiKey) {
        for (const key of aliases.apiKey) {
          if (process.env[key]) {
            agent.apiKey = process.env[key]!;
            break;
          }
        }
      }

      if (!agent.endpoint && aliases.endpoint) {
        for (const key of aliases.endpoint) {
          if (process.env[key]) {
            agent.endpoint = process.env[key];
            break;
          }
        }
      }
    });

    // Logging configuration
    if (process.env.LOG_LEVEL) {
      config.logging.level = process.env
        .LOG_LEVEL as Configuration["logging"]["level"];
    }

    if (process.env.LOG_FORMAT) {
      config.logging.format = process.env
        .LOG_FORMAT as Configuration["logging"]["format"];
    }

    // Execution configuration
    if (process.env.MAX_CONCURRENT_JOBS) {
      config.execution.maxConcurrentJobs = parseInt(
        process.env.MAX_CONCURRENT_JOBS,
        10,
      );
    }

    if (process.env.DEFAULT_TIMEOUT) {
      config.execution.defaultTimeout = parseInt(
        process.env.DEFAULT_TIMEOUT,
        10,
      );
    }

    if (process.env.RETRY_ATTEMPTS) {
      config.execution.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS, 10);
    }

    // AWS configuration
    if (process.env.AWS_REGION && process.env.SSM_PARAMETER_PATH) {
      config.aws = {
        region: process.env.AWS_REGION,
        ssmParameterPath: process.env.SSM_PARAMETER_PATH,
      };
    }

    // Git configuration for commits
    config.git = {
      userName: process.env.GIT_USER_NAME || "Vibes Viber",
      userEmail: process.env.GIT_USER_EMAIL || "viberator@viberglass.io",
    };

    return config;
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

  /**
   * Load agent configuration by name
   */
  loadAgentConfig(agentName?: string): AgentConfig {
    const name = agentName || process.env.DEFAULT_AGENT || DEFAULT_AGENT_TYPE;

    const agentConfig = this.config.agents[name];
    if (!agentConfig) {
      this.logger.warn(
        `Agent ${name} not found, falling back to ${DEFAULT_AGENT_TYPE}`,
      );
      return this.config.agents[DEFAULT_AGENT_TYPE];
    }

    this.logger.info(`Loaded agent configuration for: ${name}`);
    return agentConfig;
  }

  /**
   * Resolve secrets from SSM/env based on metadata (for ECS/Lambda workers)
   */
  async resolveSecrets(
    secretMetadata: SecretMetadata[],
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};

    for (const secret of secretMetadata) {
      try {
        if (secret.secretLocation === "env") {
          // Read from environment variables
          const value = process.env[secret.name];
          if (value) {
            resolved[secret.name] = value;
            this.logger.debug(`Resolved secret from env: ${secret.name}`);
          } else {
            this.logger.warn(`Secret ${secret.name} not found in environment`);
          }
        } else if (
          secret.secretLocation === "ssm" &&
          secret.secretPath &&
          this.ssmClient
        ) {
          // Use SSM loader if available, otherwise fetch directly
          if (this.ssmLoader) {
            const ssmSecrets = await this.ssmLoader.resolveSecrets([secret]);
            Object.assign(resolved, ssmSecrets);
          } else {
            // Fallback to direct SSM fetch
            const command = new GetParameterCommand({
              Name: secret.secretPath,
              WithDecryption: true,
            });
            const response = await this.ssmClient.send(command);

            if (response.Parameter?.Value) {
              resolved[secret.name] = response.Parameter.Value;
              this.logger.debug(`Resolved secret from SSM: ${secret.name}`);
            } else {
              this.logger.warn(
                `Secret ${secret.name} not found in SSM at path: ${secret.secretPath}`,
              );
            }
          }
        } else if (secret.secretLocation === "database") {
          // Database secrets should already be resolved by the platform
          // This is a fallback - log a warning
          this.logger.warn(
            `Secret ${secret.name} is stored in database but should be resolved by platform`,
          );
        }
      } catch (error) {
        this.logger.error(`Error resolving secret ${secret.name}`, { error });
      }
    }

    this.logger.info(
      `Resolved ${Object.keys(resolved).length} of ${secretMetadata.length} secrets`,
    );
    return resolved;
  }
}
