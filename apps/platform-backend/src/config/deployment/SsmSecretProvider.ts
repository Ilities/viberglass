/**
 * AWS SSM Parameter Store implementation of SecretProvider
 *
 * Provides deployment secret management using AWS Systems Manager Parameter Store.
 * Uses hierarchical path structure: /viberator/{environment}/{category}/{key}
 *
 * Example paths:
 * - /viberator/dev/database/url
 * - /viberator/prod/amplify/appId
 * - /viberator/staging/frontend/apiUrl
 */

import {
  GetParameterCommand,
  PutParameterCommand,
  DeleteParameterCommand,
  GetParametersByPathCommand,
  SSMClient,
  SSMServiceException,
} from "@aws-sdk/client-ssm";
import { SecretProvider, SecretOptions } from "./SecretProvider.js";

/**
 * Constructor options for SsmSecretProvider
 */
export interface SsmSecretProviderOptions {
  /**
   * AWS region for SSM client
   */
  region: string;

  /**
   * Optional KMS key ID for SecureString encryption
   * If not specified, uses AWS default KMS key for SSM
   */
  kmsKeyId?: string;

  /**
   * Optional prefix for all SSM parameters
   * @default "/viberator"
   */
  prefix?: string;
}

/**
 * SSM Parameter Store implementation of SecretProvider
 */
export class SsmSecretProvider implements SecretProvider {
  readonly name = "SsmSecretProvider";
  private readonly client: SSMClient;
  private readonly kmsKeyId?: string;
  private readonly prefix: string;

  constructor(options: SsmSecretProviderOptions) {
    this.client = new SSMClient({
      region: options.region,
    });
    this.kmsKeyId = options.kmsKeyId;
    this.prefix = options.prefix || "/viberator";
  }

  /**
   * Build SSM parameter path from environment and key
   * @param environment - Environment name (dev, staging, prod)
   * @param key - Secret key (can include category like "database.url")
   * @returns Full SSM parameter path
   */
  private buildPath(environment: string, key: string): string {
    // Remove leading slashes and normalize
    const normalizedKey = key.replace(/^\/+/, "").replace(/\/+/g, "/");
    return `${this.prefix}/${environment}/${normalizedKey}`;
  }

  async getSecret(environment: string, key: string): Promise<string | null> {
    try {
      const path = this.buildPath(environment, key);

      const command = new GetParameterCommand({
        Name: path,
        WithDecryption: true, // Always decrypt to support both SecureString and String
      });

      const response = await this.client.send(command);

      return response.Parameter?.Value || null;
    } catch (error) {
      if (error instanceof SSMServiceException) {
        if (error.name === "ParameterNotFound") {
          return null;
        }
        throw new Error(
          `SSM getSecret failed: ${error.name} - ${error.message}`,
        );
      }
      throw error;
    }
  }

  async putSecret(
    environment: string,
    key: string,
    value: string,
    options?: SecretOptions,
  ): Promise<void> {
    try {
      const path = this.buildPath(environment, key);
      const secure = options?.secure !== false; // Default to true
      const description = options?.description;

      const command = new PutParameterCommand({
        Name: path,
        Value: value,
        Type: secure ? "SecureString" : "String",
        Description: description,
        KeyId: options?.kmsKeyId || this.kmsKeyId, // Use option-specific or default KMS key
        Overwrite: true, // Idempotent
      });

      await this.client.send(command);
    } catch (error) {
      if (error instanceof SSMServiceException) {
        throw new Error(
          `SSM putSecret failed: ${error.name} - ${error.message}`,
        );
      }
      throw error;
    }
  }

  async deleteSecret(environment: string, key: string): Promise<void> {
    try {
      const path = this.buildPath(environment, key);

      const command = new DeleteParameterCommand({
        Name: path,
      });

      await this.client.send(command);
    } catch (error) {
      if (error instanceof SSMServiceException) {
        if (error.name === "ParameterNotFound") {
          // Already deleted, consider success
          return;
        }
        throw new Error(
          `SSM deleteSecret failed: ${error.name} - ${error.message}`,
        );
      }
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try listing parameters with our prefix to verify AWS credentials work
      const command = new GetParametersByPathCommand({
        Path: `${this.prefix}/`,
        MaxResults: 1, // Only check if we can access, don't fetch all
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error instanceof SSMServiceException) {
        // Auth/region errors mean provider is not available
        if (
          error.name === "UnauthorizedException" ||
          error.name === "AccessDenied" ||
          error.name === "InvalidAccessKeyId"
        ) {
          return false;
        }
        // NoSuchBucket or other errors might mean we're available but no params yet
        // Try a different check - try to get a non-existent parameter
        try {
          const testCommand = new GetParameterCommand({
            Name: `${this.prefix}/__availability_check__`,
            WithDecryption: false,
          });
          await this.client.send(testCommand);
          return true; // Should not happen, but if we get here we're available
        } catch (testError) {
          // If we get ParameterNotFound, credentials work (parameter just doesn't exist)
          return (
            testError instanceof SSMServiceException &&
            testError.name === "ParameterNotFound"
          );
        }
      }
      return false;
    }
  }
}
