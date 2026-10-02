import type { Clanker } from "@viberglass/types";
import { resolveClankerConfig } from "./index";

/**
 * The container image a clanker's runs start from, as its invoker reads it:
 * Docker, ECS, and Kubernetes run `containerImage`, Lambda runs `imageUri`. Null when the
 * config names none (a Lambda deployed from a zip, an ECS task definition
 * that owns its image), rather than a plausible default.
 */
export function resolveComputeImage(clanker: Clanker): string | null {
  const strategy = resolveClankerConfig(clanker).config.strategy;
  switch (strategy.type) {
    case "docker":
    case "ecs":
    case "kubernetes":
      return strategy.containerImage ?? null;
    case "lambda":
      return strategy.imageUri ?? null;
  }
}
