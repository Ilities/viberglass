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
import { buildLambdaFunctionName } from "./lambdaFunctionUtils";
import type { LambdaProvisioningConfig } from "./lambdaTypes";

function toLambdaProvisioningConfig(clanker: Clanker): LambdaProvisioningConfig {
  const strategy = getLambdaStrategyConfig(clanker);
  return {
    type: "lambda",
    provisioningMode: strategy.provisioningMode,
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
    const provisioningMode =
      config.provisioningMode === "prebuilt" ? "prebuilt" : "managed";
    if (provisioningMode === "managed") {
      const selectedImage = getWorkerImageForClanker(clanker, "lambda", {
        ignoreStrategyImage: true,
      });
      if (selectedImage) {
        config.imageUri = selectedImage;
      }
    } else if (!config.imageUri) {
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

  async deprovision(clanker: Clanker): Promise<ProvisioningResult> {
    const config = toLambdaProvisioningConfig(clanker);
    const provisioningMode =
      config.provisioningMode === "prebuilt" ? "prebuilt" : "managed";

    if (provisioningMode === "prebuilt") {
      return {
        status: "inactive",
        statusMessage: "Deactivated by user",
      };
    }

    const functionIdentifier =
      config.functionArn || config.functionName || buildLambdaFunctionName(clanker);

    try {
      await this.lambdaClient.deleteFunction(functionIdentifier);
    } catch (error) {
      if (getErrorName(error) !== "ResourceNotFoundException") {
        throw error;
      }
    }

    const deploymentConfig = mergeProvisionedStrategyIntoConfig(clanker, {
      ...config,
      functionName: undefined,
      functionArn: undefined,
      functionDetails: undefined,
      imageUri: undefined,
    });

    return {
      deploymentConfig,
      status: "inactive",
      statusMessage: "Lambda function deleted",
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
