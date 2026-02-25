import {
  getWorkerImageRepositoryName,
  resolveWorkerImageVariantForAgent,
  type Clanker,
} from "@viberglass/types";
import type { ProvisioningStrategyName } from "../types";
import { getOptionalString } from "./configHelpers";
import { resolveClankerConfig } from "../../clanker-config";

function buildImageUrl(
  registry: string,
  prefix: string,
  repositoryName: string,
): string {
  const parts = [registry, prefix, repositoryName].filter(Boolean);
  return `${parts.join("/")}:latest`;
}

interface WorkerImageResolutionOptions {
  ignoreStrategyImage?: boolean;
}

export function getWorkerImageForClanker(
  clanker: Clanker,
  strategy: ProvisioningStrategyName,
  options?: WorkerImageResolutionOptions,
): string | undefined {
  const resolved = resolveClankerConfig(clanker).config;
  const strategyConfig =
    resolved.strategy.type === strategy ? resolved.strategy : undefined;

  if (!options?.ignoreStrategyImage) {
    const explicitImage =
      strategy === "lambda"
        ? getOptionalString(
            strategyConfig && "imageUri" in strategyConfig
              ? strategyConfig.imageUri
              : undefined,
          )
        : getOptionalString(
            strategyConfig && "containerImage" in strategyConfig
              ? strategyConfig.containerImage
              : undefined,
          );

    if (explicitImage) {
      return explicitImage;
    }
  }

  if (strategy === "lambda") {
    const defaultLambdaImage = getOptionalString(
      process.env.VIBERATOR_LAMBDA_IMAGE_URI,
    );
    if (defaultLambdaImage) {
      return defaultLambdaImage;
    }
  }

  const imagePrefix = process.env.VIBERATOR_WORKER_IMAGE_PREFIX || "";
  const registry = process.env.VIBERATOR_WORKER_REGISTRY || "";
  const imageVariant =
    strategy === "lambda"
      ? "lambda"
      : resolveWorkerImageVariantForAgent(clanker.agent);
  const repositoryName = getWorkerImageRepositoryName(imageVariant);

  if (!repositoryName) {
    return undefined;
  }

  return buildImageUrl(registry, imagePrefix, repositoryName);
}
