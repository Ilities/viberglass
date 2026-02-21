import type { Clanker } from "@viberglass/types";
import { mergeProvisionedStrategyIntoConfig } from "../../clanker-config/mergeProvisionedConfig";
import type { ProvisioningStrategyHandler } from "../ProvisioningStrategyHandler";
import type { LambdaClientPort } from "../ports/LambdaClientPort";
import { getErrorMessage, getErrorName } from "../shared/errorUtils";
import { getLambdaStrategyConfig } from "../shared/configHelpers";
import { getWorkerImageForClanker } from "../shared/workerImage";
import type {
  AvailabilityResult,
  ProvisioningProgressReporter,
  ProvisioningResult,
} from "../types";
import { LambdaFunctionProvisioner } from "./LambdaFunctionProvisioner";
import type { LambdaProvisioningConfig } from "./lambdaTypes";

function toLambdaProvisioningConfig(clanker: Clanker): LambdaProvisioningConfig {
  const strategy = getLambdaStrategyConfig(clanker);
  return {
    type: "lambda",
    functionName: strategy.functionName,
    functionArn: strategy.functionArn,
    functionDetails: strategy.functionDetails,
    imageUri: strategy.imageUri,
    roleArn: strategy.roleArn,
    memorySize: strategy.memorySize,
    timeout: strategy.timeout,
    environment: strategy.environment,
    architecture: strategy.architecture,
    vpc: strategy.vpc,
    region: strategy.region,
  };
}

export class LambdaProvisioningHandler implements ProvisioningStrategyHandler {
  private readonly lambdaFunctionProvisioner: LambdaFunctionProvisioner;

  constructor(private readonly lambdaClient: LambdaClientPort) {
    this.lambdaFunctionProvisioner = new LambdaFunctionProvisioner(lambdaClient);
  }

  getPreflightError(_clanker: Clanker): string | null {
    return null;
  }

  async provision(
    clanker: Clanker,
    progress?: ProvisioningProgressReporter,
  ): Promise<ProvisioningResult> {
    const config = toLambdaProvisioningConfig(clanker);
    if (!config.imageUri) {
      const selectedImage = getWorkerImageForClanker(clanker, "lambda");
      if (selectedImage) {
        config.imageUri = selectedImage;
      }
    }

    await progress?.("Deploying Lambda function...");
    const functionInfo = await this.lambdaFunctionProvisioner.ensureFunction(
      clanker,
      config,
      progress,
    );

    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...config,
      functionName: functionInfo.functionName,
      functionArn: functionInfo.functionArn,
      functionDetails: functionInfo.functionDetails,
    });

    const availability = await this.checkAvailability({
      ...clanker,
      deploymentConfig,
    });

    return {
      deploymentConfig,
      status: availability.status,
      statusMessage: availability.statusMessage,
    };
  }

  async checkAvailability(clanker: Clanker): Promise<AvailabilityResult> {
    const config = toLambdaProvisioningConfig(clanker);
    const functionName = config.functionArn || config.functionName;
    if (!functionName) {
      return {
        status: "inactive",
        statusMessage: "Lambda function not configured",
      };
    }

    try {
      await this.lambdaClient.getFunction(functionName);
      return {
        status: "active",
        statusMessage: `Lambda function ready: ${functionName}`,
      };
    } catch (error) {
      if (getErrorName(error) === "ResourceNotFoundException") {
        return {
          status: "inactive",
          statusMessage: "Lambda function not found",
        };
      }

      return {
        status: "failed",
        statusMessage: `Lambda availability check failed: ${getErrorMessage(
          error,
          "Unknown error",
        )}`,
      };
    }
  }
}
