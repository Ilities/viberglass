import type { LambdaStrategyConfig } from "@viberglass/types";
import {
  toNonEmptyString,
  toObjectRecord,
  toOptionalFiniteNumber,
  toStringArray,
  toStringRecord,
} from "../parsers";

export function normalizeLambdaStrategyConfig(value: unknown): LambdaStrategyConfig {
  const source = toObjectRecord(value) || {};
  const vpc = toObjectRecord(source.vpc);

  return {
    type: "lambda",
    provisioningMode: source.provisioningMode === "prebuilt" ? "prebuilt" : "managed",
    functionName: toNonEmptyString(source.functionName),
    functionArn: toNonEmptyString(source.functionArn),
    imageUri: toNonEmptyString(source.imageUri),
    roleArn: toNonEmptyString(source.roleArn),
    memorySize: toOptionalFiniteNumber(source.memorySize),
    timeout: toOptionalFiniteNumber(source.timeout),
    environment: toStringRecord(source.environment),
    architecture:
      source.architecture === "x86_64" || source.architecture === "arm64"
        ? source.architecture
        : undefined,
    vpc: vpc
      ? {
          subnetIds: toStringArray(vpc.subnetIds),
          securityGroupIds: toStringArray(vpc.securityGroupIds),
        }
      : undefined,
    region: toNonEmptyString(source.region),
    functionDetails: toObjectRecord(source.functionDetails),
  };
}
