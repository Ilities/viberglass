import type {
  UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import { objectStorageBucket, type Clanker } from "@viberglass/types";
import type {
  LambdaClientPort,
  LambdaFunctionResponse,
} from "../ports/LambdaClientPort";
import { createChildLogger } from "../../config/logger";
import { getErrorMessage, getErrorName } from "../shared/errorUtils";
import type { ProvisioningProgressReporter } from "../types";
import {
  buildLambdaFunctionName,
  mapLambdaFunctionDetails,
} from "./lambdaFunctionUtils";
import {
  DEFAULT_LAMBDA_MEMORY_MB,
  DEFAULT_LAMBDA_TIMEOUT_SECONDS,
  type LambdaFunctionDetails,
  type LambdaProvisioningConfig,
} from "./lambdaTypes";

const logger = createChildLogger({ service: "LambdaFunctionProvisioner" });

/** A managed function also gets the bucket its worker saves conversation state in; a prebuilt one keeps its own. */
function functionEnvironment(config: LambdaProvisioningConfig): Record<string, string> | undefined {
  const bucket = objectStorageBucket(process.env);
  if (config.provisioningMode === "prebuilt" || !bucket) return config.environment;
  return { AWS_S3_BUCKET: bucket, ...config.environment };
}

export class LambdaFunctionProvisioner {
  constructor(private readonly lambdaClient: LambdaClientPort) {}

  async ensureFunction(
    clanker: Clanker,
    config: LambdaProvisioningConfig,
    progress?: ProvisioningProgressReporter,
  ): Promise<{
    functionName: string;
    functionArn?: string;
    functionDetails: LambdaFunctionDetails;
  }> {
    const provisioningMode =
      config.provisioningMode === "prebuilt" ? "prebuilt" : "managed";
    const explicitArn = provisioningMode === "prebuilt" ? config.functionArn : undefined;
    const explicitName =
      provisioningMode === "prebuilt" ? config.functionName : undefined;
    const derivedName = buildLambdaFunctionName(clanker);
    const functionIdentifier = explicitArn || explicitName || derivedName;
    const functionName = explicitName || derivedName;

    const existingResponse = await this.loadExistingFunction(functionIdentifier);
    if (!existingResponse && explicitArn) {
      throw new Error(`Lambda function not found for ARN: ${explicitArn}`);
    }

    const imageUri =
      config.imageUri ||
      process.env.VIBERATOR_LAMBDA_IMAGE_URI ||
      existingResponse?.Code?.ImageUri;

    if (existingResponse) {
      await this.updateExistingFunction(
        functionIdentifier,
        functionName,
        config,
        imageUri,
        progress,
      );
    } else {
      await this.createNewFunction(functionName, config, imageUri, progress);
    }
    if (provisioningMode === "managed") await this.turnOffRetries(functionIdentifier);

    const refreshed = await this.lambdaClient.getFunction(functionIdentifier);
    return {
      functionName: refreshed.Configuration?.FunctionName || functionName,
      functionArn: refreshed.Configuration?.FunctionArn,
      functionDetails: mapLambdaFunctionDetails(refreshed),
    };
  }

  /** Viberglass retries runs itself; Lambda's own async retries would start a failed run twice more. */
  private async turnOffRetries(functionIdentifier: string): Promise<void> {
    try {
      await this.lambdaClient.putFunctionEventInvokeConfig({ FunctionName: functionIdentifier, MaximumRetryAttempts: 0 });
    } catch (error) {
      logger.warn("Couldn't turn off Lambda's own retries; a failed run may start again", {
        functionName: functionIdentifier,
        error: getErrorMessage(error, "unknown error"),
      });
    }
  }

  private async loadExistingFunction(
    functionIdentifier: string,
  ): Promise<LambdaFunctionResponse | null> {
    try {
      return await this.lambdaClient.getFunction(functionIdentifier);
    } catch (error) {
      if (getErrorName(error) !== "ResourceNotFoundException") {
        throw error;
      }

      return null;
    }
  }

  private async updateExistingFunction(
    functionIdentifier: string,
    functionName: string,
    config: LambdaProvisioningConfig,
    imageUri: string | undefined,
    progress?: ProvisioningProgressReporter,
  ): Promise<void> {
    if (imageUri) {
      await progress?.(`Updating Lambda image for ${functionName}...`);
      await this.lambdaClient.updateFunctionCode({
        FunctionName: functionIdentifier,
        ImageUri: imageUri,
      });
    }

    const configurationUpdate: UpdateFunctionConfigurationCommandInput = {
      FunctionName: functionIdentifier,
    };

    if (config.roleArn) configurationUpdate.Role = config.roleArn;
    const managed = config.provisioningMode !== "prebuilt";
    const memorySize = config.memorySize ?? (managed ? DEFAULT_LAMBDA_MEMORY_MB : undefined);
    const timeout = config.timeout ?? (managed ? DEFAULT_LAMBDA_TIMEOUT_SECONDS : undefined);
    if (memorySize !== undefined) configurationUpdate.MemorySize = memorySize;
    if (timeout !== undefined) configurationUpdate.Timeout = timeout;
    if (config.ephemeralStorage !== undefined) {
      configurationUpdate.EphemeralStorage = { Size: config.ephemeralStorage };
    }
    const environment = functionEnvironment(config);
    if (environment) {
      configurationUpdate.Environment = { Variables: environment };
    }

    if (config.vpc) {
      configurationUpdate.VpcConfig = {
        SubnetIds: config.vpc.subnetIds,
        SecurityGroupIds: config.vpc.securityGroupIds,
      };
    }

    if (Object.keys(configurationUpdate).length > 1) {
      await progress?.(`Updating Lambda configuration for ${functionName}...`);
      await this.lambdaClient.updateFunctionConfiguration(configurationUpdate);
    }
  }

  private async createNewFunction(
    functionName: string,
    config: LambdaProvisioningConfig,
    imageUri: string | undefined,
    progress?: ProvisioningProgressReporter,
  ): Promise<void> {
    const roleArn = config.roleArn || process.env.VIBERATOR_LAMBDA_ROLE_ARN;
    if (!imageUri || !roleArn) {
      throw new Error("Lambda creation requires imageUri and roleArn");
    }

    const environment = functionEnvironment(config);
    await progress?.(`Creating Lambda function ${functionName}...`);
    await this.lambdaClient.createFunction({
      FunctionName: functionName,
      Role: roleArn,
      Code: { ImageUri: imageUri },
      PackageType: "Image",
      MemorySize: config.memorySize ?? DEFAULT_LAMBDA_MEMORY_MB,
      Timeout: config.timeout ?? DEFAULT_LAMBDA_TIMEOUT_SECONDS,
      EphemeralStorage: config.ephemeralStorage !== undefined
        ? { Size: config.ephemeralStorage }
        : { Size: 2048 },
      Environment: environment ? { Variables: environment } : undefined,
      Architectures: config.architecture ? [config.architecture] : undefined,
      VpcConfig: config.vpc
        ? {
            SubnetIds: config.vpc.subnetIds,
            SecurityGroupIds: config.vpc.securityGroupIds,
          }
        : undefined,
    });
  }
}
