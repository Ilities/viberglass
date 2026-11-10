import type { Clanker, EcsStrategyConfig } from "@viberglass/types";
import { getWorkerImageForClanker } from "../provisioning/shared/workerImage";
import { resolveClankerConfig } from "./index";
import { isObjectRecord, toNonEmptyString } from "./parsers";

/** The image the task definition's worker container runs, as recorded when the runner started. */
function ecsDeployedImage(strategy: EcsStrategyConfig): string | undefined {
  const images = strategy.taskDefinitionDetails?.containerImages;
  if (!Array.isArray(images)) return undefined;
  const containers = images.filter(isObjectRecord);
  const worker = strategy.containerName
    ? containers.find((container) => container.name === strategy.containerName)
    : containers[0];
  return toNonEmptyString(worker?.image);
}

/**
 * The image a clanker's runs start from now. A runner on the published worker
 * images follows this installation's registry and tag; a custom image is used
 * as is. ECS and Lambda run what was deployed when the runner last started.
 * Null when there is none to name (a Lambda deployed from a zip, a runner not
 * built yet), rather than a plausible default.
 */
export function resolveComputeImage(clanker: Clanker): string | null {
  const strategy = resolveClankerConfig(clanker).config.strategy;
  switch (strategy.type) {
    case "docker":
      return strategy.provisioningMode === "prebuilt"
        ? getWorkerImageForClanker(clanker, "docker") ?? null
        : strategy.containerImage ?? null;
    case "kubernetes":
      return getWorkerImageForClanker(clanker, "kubernetes") ?? null;
    case "ecs":
      return ecsDeployedImage(strategy) ?? strategy.containerImage ?? null;
    case "lambda":
      return toNonEmptyString(strategy.functionDetails?.imageUri) ?? strategy.imageUri ?? null;
  }
}
