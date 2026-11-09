import { isObjectRecord, readWorkerModelEndpoint, type WorkerModelEndpoint } from "@viberglass/types";

/** The workspace model endpoint the run's runner uses, or undefined when it runs its harness's own provider. */
export function runModelEndpoint(clankerConfig: Record<string, unknown> | undefined): WorkerModelEndpoint | undefined {
  const config = isObjectRecord(clankerConfig?.deploymentConfig) ? clankerConfig.deploymentConfig : clankerConfig;
  return readWorkerModelEndpoint(config?.resolvedModelEndpoint);
}
