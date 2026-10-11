import type { IntegrationRegistry, RepositoryHost } from "@viberglass/integration-core";
import { integrationRegistry } from "../../integrations/registerIntegrationPlugins";
import { SETUP_SERVICE_ERROR_CODE, SetupServiceError } from "../errors/SetupServiceError";

/** The code host first-run setup connects: the build's ready code host that can check a repository. */
export interface SetupCodeHost {
  /** The integration's id, which its connections are stored under. */
  system: string;
  label: string;
  repository: RepositoryHost;
}

export function findSetupCodeHost(registry: Pick<IntegrationRegistry, "list"> = integrationRegistry): SetupCodeHost | null {
  const plugin = registry.list().find((candidate) => candidate.category === "scm" && candidate.status === "ready" && candidate.repository);
  return plugin?.repository ? { system: plugin.id, label: plugin.label, repository: plugin.repository } : null;
}

/** Throws when the build has no code host to set up. */
export function requireSetupCodeHost(find: () => SetupCodeHost | null): SetupCodeHost {
  const codeHost = find();
  if (!codeHost) {
    throw new SetupServiceError(SETUP_SERVICE_ERROR_CODE.HOST_ERROR, "This installation has no code host to connect a repository with.");
  }
  return codeHost;
}
