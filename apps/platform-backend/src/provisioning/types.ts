import type { ClankerStatus } from "@viberglass/types";

export type ProvisioningStrategyName = "docker" | "ecs" | "lambda";

export interface ProvisioningResult {
  deploymentConfig?: Record<string, unknown> | null;
  status: ClankerStatus;
  statusMessage?: string | null;
}

export interface AvailabilityResult {
  status: ClankerStatus;
  statusMessage?: string | null;
}

export type ProvisioningProgressReporter = (
  statusMessage: string,
) => Promise<void> | void;
