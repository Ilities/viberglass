import type { DeploymentStrategy } from "@viberglass/types";
import { kubernetesEnvironmentError } from "./kubernetesEnvironment";

export function isAwsDeployment(): boolean {
  return Boolean(
    process.env.AWS_EXECUTION_ENV?.startsWith("AWS_ECS") ||
    process.env.AWS_EXECUTION_ENV?.startsWith("AWS_Lambda") ||
    process.env.ECS_CONTAINER_METADATA_URI_V4 ||
    process.env.ECS_CONTAINER_METADATA_URI ||
    process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

export function availableDeploymentStrategies(
  strategies: DeploymentStrategy[],
): DeploymentStrategy[] {
  const aws = isAwsDeployment();
  const defaultName = aws
    ? "ecs"
    : process.env.KUBERNETES_WORKER_NAMESPACE?.trim()
      ? "kubernetes"
      : "docker";
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
    );
}
