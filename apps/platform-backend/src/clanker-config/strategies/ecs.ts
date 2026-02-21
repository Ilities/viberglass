import type { EcsStrategyConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord, toStringArray } from "../parsers";

export function normalizeEcsStrategyConfig(value: unknown): EcsStrategyConfig {
  const source = toObjectRecord(value) || {};

  const assignPublicIp =
    source.assignPublicIp === "ENABLED" || source.assignPublicIp === "DISABLED"
      ? source.assignPublicIp
      : undefined;

  return {
    type: "ecs",
    provisioningMode: source.provisioningMode === "prebuilt" ? "prebuilt" : "managed",
    clusterArn: toNonEmptyString(source.clusterArn),
    taskDefinitionArn: toNonEmptyString(source.taskDefinitionArn),
    subnetIds: toStringArray(source.subnetIds, {
      trimValues: true,
      omitEmpty: true,
    }),
    securityGroupIds: toStringArray(source.securityGroupIds, {
      trimValues: true,
      omitEmpty: true,
    }),
    assignPublicIp,
    containerName: toNonEmptyString(source.containerName),
    taskDefinition: toObjectRecord(source.taskDefinition),
    taskDefinitionDetails: toObjectRecord(source.taskDefinitionDetails),
    family: toNonEmptyString(source.family),
    containerImage: toNonEmptyString(source.containerImage),
    executionRoleArn: toNonEmptyString(source.executionRoleArn),
    taskRoleArn: toNonEmptyString(source.taskRoleArn),
    cpu: toNonEmptyString(source.cpu),
    memory: toNonEmptyString(source.memory),
    logGroup: toNonEmptyString(source.logGroup),
    logStreamPrefix: toNonEmptyString(source.logStreamPrefix),
    region: toNonEmptyString(source.region),
  };
}
