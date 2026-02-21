import type { Clanker } from "@viberglass/types";
import type { LambdaFunctionResponse } from "../ports/LambdaClientPort";
import type { LambdaFunctionDetails } from "./lambdaTypes";

export function buildLambdaFunctionName(clanker: Clanker): string {
  const base = `viberator-${clanker.slug || clanker.id}`;
  return base.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 64);
}

export function mapLambdaFunctionDetails(
  response: LambdaFunctionResponse,
): LambdaFunctionDetails {
  return {
    functionName: response.Configuration?.FunctionName,
    functionArn: response.Configuration?.FunctionArn,
    imageUri: response.Code?.ImageUri,
    roleArn: response.Configuration?.Role,
    version: response.Configuration?.Version,
    state: response.Configuration?.State,
    lastModified: response.Configuration?.LastModified,
    memorySize: response.Configuration?.MemorySize,
    timeout: response.Configuration?.Timeout,
    architectures: response.Configuration?.Architectures,
  };
}
