import {
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
import { waitUntilFunctionActive } from "@aws-sdk/client-lambda";
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

  /**
   * Waits for a Lambda function to become active after an update.
   * Lambda functions enter an "InProgress" state during updates and reject
   * subsequent operations until they become "Active" again.
   */
  private async waitForFunctionUpdate(functionName: string): Promise<void> {
    await waitUntilFunctionActive(
      { client: this.lambdaClient, maxWaitTime: 300 },
      { FunctionName: functionName },
    );
  }
}
