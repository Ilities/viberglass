import {
  DeleteFunctionCommand,
  CreateFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type CreateFunctionCommandInput,
  type GetFunctionCommandOutput,
  type UpdateFunctionCodeCommandInput,
  type UpdateFunctionConfigurationCommandInput,
} from "@aws-sdk/client-lambda";
import type { LambdaClientPort } from "../ports/LambdaClientPort";

export class AwsLambdaClientAdapter implements LambdaClientPort {
  constructor(
    private readonly lambdaClient: LambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || "eu-west-1",
    }),
  ) {}

  getFunction(functionName: string): Promise<GetFunctionCommandOutput> {
    return this.lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
  }

  async createFunction(input: CreateFunctionCommandInput): Promise<void> {
    await this.lambdaClient.send(new CreateFunctionCommand(input));
    if (input.FunctionName) {
      await this.waitForFunctionActive(input.FunctionName);
    }
  }

  async updateFunctionCode(input: UpdateFunctionCodeCommandInput): Promise<void> {
    await this.lambdaClient.send(new UpdateFunctionCodeCommand(input));
    if (input.FunctionName) {
      await this.waitForFunctionUpdate(input.FunctionName);
    }
  }

  async updateFunctionConfiguration(
    input: UpdateFunctionConfigurationCommandInput,
  ): Promise<void> {
    await this.lambdaClient.send(new UpdateFunctionConfigurationCommand(input));
    if (input.FunctionName) {
      await this.waitForFunctionUpdate(input.FunctionName);
    }
  }

  async deleteFunction(functionName: string): Promise<void> {
    await this.lambdaClient.send(
      new DeleteFunctionCommand({ FunctionName: functionName }),
    );
  }

  /**
   * Waits for a newly created Lambda function to reach Active state.
   * Lambda functions start in "Pending" state after creation and reject
   * invocations until they become "Active".
   * Polls every 2 seconds for up to 5 minutes.
   */
  private async waitForFunctionActive(functionName: string): Promise<void> {
    const maxWaitTime = 300000; // 5 minutes in milliseconds
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const response = await this.lambdaClient.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      );

      const state = response.Configuration?.State;

      if (state === "Active") {
        return;
      }

      if (state === "Failed") {
        const reason = response.Configuration?.StateReason || "Unknown error";
        throw new Error(`Lambda function creation failed: ${reason}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Lambda function activation timed out after ${maxWaitTime / 1000} seconds for function: ${functionName}`,
    );
  }

  /**
   * Waits for a Lambda function update to complete.
   * Lambda functions enter a "InProgress" last update status during updates and reject
   * subsequent operations until the update becomes "Successful".
   * Polls every 2 seconds for up to 5 minutes.
   */
  private async waitForFunctionUpdate(functionName: string): Promise<void> {
    const maxWaitTime = 300000; // 5 minutes in milliseconds
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();
    let hasSeenInProgress = false;

    while (Date.now() - startTime < maxWaitTime) {
      const response = await this.lambdaClient.send(
        new GetFunctionCommand({ FunctionName: functionName }),
      );

      const lastUpdateStatus = response.Configuration?.LastUpdateStatus;

      // Track when we see InProgress to ensure we're waiting for the current update
      if (lastUpdateStatus === "InProgress") {
        hasSeenInProgress = true;
      }

      // Only consider Successful valid if we've seen InProgress first
      // This prevents returning immediately when the status still shows Successful
      // from a previous update before the current one has started tracking
      if (lastUpdateStatus === "Successful" && hasSeenInProgress) {
        return;
      }

      if (lastUpdateStatus === "Failed") {
        const reason = response.Configuration?.LastUpdateStatusReason || "Unknown error";
        throw new Error(`Lambda function update failed: ${reason}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Lambda function update timed out after ${maxWaitTime / 1000} seconds for function: ${functionName}`,
    );
  }
}
