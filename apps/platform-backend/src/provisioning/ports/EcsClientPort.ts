import type {
  RegisterTaskDefinitionCommandInput,
  TaskDefinition,
} from "@aws-sdk/client-ecs";

export interface EcsClientPort {
  describeTaskDefinition(taskDefinitionArn: string): Promise<TaskDefinition | null>;
  registerTaskDefinition(
    input: RegisterTaskDefinitionCommandInput,
  ): Promise<TaskDefinition | null>;
}
