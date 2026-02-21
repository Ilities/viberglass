import type { ProvisioningStrategyName } from "./types";

export type StrategyResolution =
  | { kind: "resolved"; strategy: ProvisioningStrategyName }
  | { kind: "missing"; message: string }
  | { kind: "unsupported"; message: string; providedName: string };

const MISSING_STRATEGY_MESSAGE = "Deployment strategy not configured";

export class ProvisioningStrategyResolver {
  resolve(name: string | null | undefined): StrategyResolution {
    const rawName = typeof name === "string" ? name.trim() : "";
    if (!rawName) {
      return { kind: "missing", message: MISSING_STRATEGY_MESSAGE };
    }

    const normalized = rawName.toLowerCase();
    if (normalized === "docker") {
      return { kind: "resolved", strategy: "docker" };
    }
    if (normalized === "ecs") {
      return { kind: "resolved", strategy: "ecs" };
    }
    if (normalized === "lambda" || normalized === "aws-lambda-container") {
      return { kind: "resolved", strategy: "lambda" };
    }

    return {
      kind: "unsupported",
      providedName: rawName,
      message: `Unsupported deployment strategy: ${rawName}`,
    };
  }
}
