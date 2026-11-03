import type { AppHostTarget } from "@viberglass/types";
import { buildImageUrl } from "../../provisioning/shared/workerImage";

type Env = Record<string, string | undefined>;

function publishedImage(repository: string, strategy: AppHostTarget, env: Env): string {
  const registry = env.VIBERATOR_WORKER_REGISTRY ?? (strategy === "ecs" ? "ghcr.io/ilities" : "");
  return buildImageUrl(registry, env.VIBERATOR_WORKER_IMAGE_PREFIX || "", repository, env.VIBERATOR_WORKER_IMAGE_TAG || "latest");
}

/** The image release builds run in, published next to the worker images unless APP_BUILDER_IMAGE names another. */
export function appBuilderImage(strategy: AppHostTarget, env: Env = process.env): string {
  return env.APP_BUILDER_IMAGE?.trim() || publishedImage("viberglass-app-builder-node", strategy, env);
}

/** The image releases run in, published next to the worker images unless APP_RUNTIME_IMAGE names another. */
export function appRuntimeImage(strategy: AppHostTarget, env: Env = process.env): string {
  return env.APP_RUNTIME_IMAGE?.trim() || publishedImage("viberglass-app-runtime-node", strategy, env);
}
