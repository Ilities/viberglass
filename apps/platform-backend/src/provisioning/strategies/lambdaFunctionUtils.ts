import type { Clanker } from "@viberglass/types";
import type { LambdaFunctionResponse } from "../ports/LambdaClientPort";
import type { LambdaFunctionDetails } from "./lambdaTypes";

export function buildLambdaFunctionName(clanker: Clanker): string {
  const rawName = clanker.name.trim().toLowerCase();
  const normalized = rawName.replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  const safeName = normalized || clanker.id.replace(/[^a-z0-9]/gi, "").slice(0, 12);
  const base = `viberator-${safeName}`;
  return base.slice(0, 64);
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
