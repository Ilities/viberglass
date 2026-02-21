import type { DockerStrategyConfig } from "@viberglass/types";
import { toNonEmptyString, toObjectRecord, toStringRecord } from "../parsers";

export function normalizeDockerStrategyConfig(value: unknown): DockerStrategyConfig {
  const source = toObjectRecord(value) || {};

  const provisioningMode = source.provisioningMode === "prebuilt" ? "prebuilt" : "managed";

  return {
    type: "docker",
    provisioningMode,
    containerImage: toNonEmptyString(source.containerImage),
    environmentVariables: toStringRecord(source.environmentVariables),
    networkMode: toNonEmptyString(source.networkMode),
    logFilePath: toNonEmptyString(source.logFilePath),
    imageMetadata: toObjectRecord(source.imageMetadata),
    dockerBuild: toObjectRecord(source.dockerBuild),
  };
}
