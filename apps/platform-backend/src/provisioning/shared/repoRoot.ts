import path from "path";
import { existsSync } from "fs";

const DEFAULT_DOCKERFILE_PATH =
  "infra/workers/docker/viberator-docker-worker.Dockerfile";

export function resolveRepoRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ];

  const matching = candidates.find((candidate) =>
    existsSync(path.resolve(candidate, DEFAULT_DOCKERFILE_PATH)),
  );

  return matching || path.resolve(cwd, "../..");
}

export const WORKER_DOCKERFILE_PATH = DEFAULT_DOCKERFILE_PATH;
