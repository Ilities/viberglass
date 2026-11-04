import type { DeploymentStrategy } from "@viberglass/types";
import { kubernetesEnvironmentError } from "./kubernetesEnvironment";
import { canBuildWorkerFromSource } from "./sourceBuild";

type Env = Record<string, string | undefined>;

export function isAwsDeployment(env: Env = process.env): boolean {
  return Boolean(
    env.AWS_EXECUTION_ENV?.startsWith("AWS_ECS") ||
    env.AWS_EXECUTION_ENV?.startsWith("AWS_Lambda") ||
    env.ECS_CONTAINER_METADATA_URI_V4 ||
    env.ECS_CONTAINER_METADATA_URI ||
    env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

/** Where workers run on this installation unless a runner says otherwise. */
export function defaultDeploymentStrategyName(env: Env = process.env): "ecs" | "kubernetes" | "docker" {
  if (isAwsDeployment(env)) return "ecs";
  return env.KUBERNETES_WORKER_NAMESPACE?.trim() ? "kubernetes" : "docker";
}

export function availableDeploymentStrategies(
  strategies: DeploymentStrategy[],
): DeploymentStrategy[] {
  const aws = isAwsDeployment();
  const defaultName = defaultDeploymentStrategyName();
  return strategies
    .filter((strategy) =>
      aws
        ? ["ecs", "lambda", "aws-lambda-container"].includes(strategy.name)
        : strategy.name !== "kubernetes" ||
          kubernetesEnvironmentError() === null,
    )
    .sort(
      (left, right) =>
        Number(right.name === defaultName) - Number(left.name === defaultName),
    )
    .map((strategy) =>
      strategy.name === "docker"
        ? { ...strategy, canBuildFromSource: canBuildWorkerFromSource() }
        : strategy,
    );
}
