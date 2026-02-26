import {
  DescribeTaskDefinitionCommand,
  ECSClient,
  RegisterTaskDefinitionCommand,
  type RegisterTaskDefinitionCommandInput,
  type TaskDefinition,
} from "@aws-sdk/client-ecs";
import type { EcsClientPort } from "../ports/EcsClientPort";

export class AwsEcsClientAdapter implements EcsClientPort {
  constructor(
    private readonly ecsClient: ECSClient = new ECSClient({
      region: process.env.AWS_REGION || "eu-west-1",
    }),
  ) {}

  async describeTaskDefinition(
    taskDefinitionArn: string,
  ): Promise<TaskDefinition | null> {
    const response = await this.ecsClient.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: taskDefinitionArn,
      }),
    );

    return response.taskDefinition || null;
  }

  async registerTaskDefinition(
    input: RegisterTaskDefinitionCommandInput,
  ): Promise<TaskDefinition | null> {
    const response = await this.ecsClient.send(
      new RegisterTaskDefinitionCommand(input),
    );

    return response.taskDefinition || null;
  }
}
