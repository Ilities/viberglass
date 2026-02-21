import type {
  UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import type { Clanker } from "@viberglass/types";
import type {
  LambdaClientPort,
  LambdaFunctionResponse,
} from "../ports/LambdaClientPort";
import { getErrorName } from "../shared/errorUtils";
import type { ProvisioningProgressReporter } from "../types";
import {
  buildLambdaFunctionName,
  mapLambdaFunctionDetails,
} from "./lambdaFunctionUtils";
import type {
  LambdaFunctionDetails,
  LambdaProvisioningConfig,
} from "./lambdaTypes";

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
    const explicitArn = config.functionArn;
    const explicitName = config.functionName;
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

    const refreshed = await this.lambdaClient.getFunction(functionIdentifier);
    return {
      functionName: refreshed.Configuration?.FunctionName || functionName,
      functionArn: refreshed.Configuration?.FunctionArn,
      functionDetails: mapLambdaFunctionDetails(refreshed),
    };
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
    if (config.memorySize !== undefined)
      configurationUpdate.MemorySize = config.memorySize;
    if (config.timeout !== undefined) configurationUpdate.Timeout = config.timeout;
    if (config.environment) {
      configurationUpdate.Environment = { Variables: config.environment };
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

    await progress?.(`Creating Lambda function ${functionName}...`);
    await this.lambdaClient.createFunction({
      FunctionName: functionName,
      Role: roleArn,
      Code: { ImageUri: imageUri },
      PackageType: "Image",
      MemorySize: config.memorySize,
      Timeout: config.timeout,
      Environment: config.environment
        ? { Variables: config.environment }
        : undefined,
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
