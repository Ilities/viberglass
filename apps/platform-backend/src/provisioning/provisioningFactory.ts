import type { ClankerProvisioner } from "./ClankerProvisioner";
import { ClankerProvisioningOrchestrator } from "./ClankerProvisioningOrchestrator";
import { ProvisioningStrategyResolver } from "./ProvisioningStrategyResolver";
import { AwsEcsClientAdapter } from "./adapters/AwsEcsClientAdapter";
import { AwsLambdaClientAdapter } from "./adapters/AwsLambdaClientAdapter";
import { DockerodeClientAdapter } from "./adapters/DockerodeClientAdapter";
import { DockerProvisioningHandler } from "./strategies/DockerProvisioningHandler";
import { EcsProvisioningHandler } from "./strategies/EcsProvisioningHandler";
import { LambdaProvisioningHandler } from "./strategies/LambdaProvisioningHandler";

let singletonProvisioner: ClankerProvisioner | null = null;

export function getClankerProvisioner(): ClankerProvisioner {
  if (singletonProvisioner) {
    return singletonProvisioner;
  }

  const dockerClient = new DockerodeClientAdapter();
  const ecsClient = new AwsEcsClientAdapter();
  const lambdaClient = new AwsLambdaClientAdapter();

  singletonProvisioner = new ClankerProvisioningOrchestrator(
    new ProvisioningStrategyResolver(),
    {
      docker: new DockerProvisioningHandler(dockerClient),
      ecs: new EcsProvisioningHandler(ecsClient),
      lambda: new LambdaProvisioningHandler(lambdaClient),
    },
  );

  return singletonProvisioner;
}

export function resetClankerProvisionerForTests(): void {
  singletonProvisioner = null;
}
