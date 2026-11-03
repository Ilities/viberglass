import { buildImageUrl } from "../../provisioning/shared/workerImage";

const APP_BUILDER_REPOSITORY = "viberglass-app-builder-node";

type Env = Record<string, string | undefined>;

/** The image release builds run in, published next to the worker images unless APP_BUILDER_IMAGE names another. */
export function appBuilderImage(strategy: "docker" | "ecs" | "kubernetes", env: Env = process.env): string {
  const explicit = env.APP_BUILDER_IMAGE?.trim();
  if (explicit) return explicit;
  const registry = env.VIBERATOR_WORKER_REGISTRY ?? (strategy === "ecs" ? "ghcr.io/ilities" : "");
  return buildImageUrl(registry, env.VIBERATOR_WORKER_IMAGE_PREFIX || "", APP_BUILDER_REPOSITORY, env.VIBERATOR_WORKER_IMAGE_TAG || "latest");
}
