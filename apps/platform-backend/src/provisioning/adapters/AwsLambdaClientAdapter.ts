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
  }

  async updateFunctionConfiguration(
    input: UpdateFunctionConfigurationCommandInput,
  ): Promise<void> {
    await this.lambdaClient.send(new UpdateFunctionConfigurationCommand(input));
  }
}
