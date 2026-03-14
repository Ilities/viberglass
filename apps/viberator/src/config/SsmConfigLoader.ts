import {
  GetParameterCommand,
  GetParametersByPathCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import type { Configuration, SecretMetadata } from "../types";
import type { Logger } from "winston";

/**
 * Handles loading configuration and secrets from AWS SSM Parameter Store.
 */
export class SsmConfigLoader {
  private client: SSMClient;
  private logger: Logger;

  constructor(client: SSMClient, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  /**
   * Apply AWS SSM Parameter Store overrides to configuration.
   * Fetches all parameters under the configured path and merges them into the config.
   */
  async loadConfigOverrides(
    config: Configuration,
  ): Promise<Configuration> {
    if (!config.aws?.ssmParameterPath) {
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

      const response = await this.client.send(command);

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
              setNestedValue(
                config.agents[agentName] as Record<string, unknown>,
                property,
                param.Value,
              );
            }
          } else if (paramName.startsWith("logging/")) {
            const property = paramName.replace("logging/", "");
            setNestedValue(
              config.logging as Record<string, unknown>,
              property,
              param.Value,
            );
          } else if (paramName.startsWith("execution/")) {
            const property = paramName.replace("execution/", "");
            setNestedValue(
              config.execution as Record<string, unknown>,
              property,
              param.Value,
            );
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
   * Resolve secrets from SSM based on metadata.
   * Used by ECS/Lambda workers to fetch runtime secrets.
   */
  async resolveSecrets(
    secretMetadata: SecretMetadata[],
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};

    for (const secret of secretMetadata) {
      if (secret.secretLocation !== "ssm" || !secret.secretPath) {
        continue;
      }

      try {
        const command = new GetParameterCommand({
          Name: secret.secretPath,
          WithDecryption: true,
        });
        const response = await this.client.send(command);

        if (response.Parameter?.Value) {
          resolved[secret.name] = response.Parameter.Value;
          this.logger.debug(`Resolved secret from SSM: ${secret.name}`);
        } else {
          this.logger.warn(
            `Secret ${secret.name} not found in SSM at path: ${secret.secretPath}`,
          );
        }
      } catch (ssmError) {
        this.logger.error(
          `Failed to fetch secret ${secret.name} from SSM`,
          { error: ssmError },
        );
      }
    }

    this.logger.info(
      `Resolved ${Object.keys(resolved).length} of ${secretMetadata.length} SSM secrets`,
    );
    return resolved;
  }
}

/**
 * Set nested value in object using dot-notation path.
 * Parses values as boolean, number, or string automatically.
 */
function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: string,
): void {
  const keys = path.split(".");
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = current[key];
    if (
      typeof existing !== "object" ||
      existing === null ||
      Array.isArray(existing)
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
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
