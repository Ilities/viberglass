import path from "path";
import { existsSync } from "fs";
import { isClankerConfigV1 } from "@viberglass/types";
import { resolveRepoRoot, WORKER_DOCKERFILE_PATH } from "./repoRoot";

export const SOURCE_BUILD_UNAVAILABLE_MESSAGE =
  "This installation can't build worker images from source because the backend has no source checkout. Choose Published image instead.";

/** A source build tars the repository root, so it needs the worker Dockerfile on disk next to the backend. */
export function canBuildWorkerFromSource(repoRoot: string = resolveRepoRoot()): boolean {
  return existsSync(path.resolve(repoRoot, WORKER_DOCKERFILE_PATH));
}

/** Whether a runner config asks Docker to build the worker image rather than use a published one. */
export function buildsDockerImageFromSource(deploymentConfig: unknown): boolean {
  return (
    isClankerConfigV1(deploymentConfig) &&
    deploymentConfig.strategy.type === "docker" &&
    deploymentConfig.strategy.provisioningMode !== "prebuilt"
  );
}
