import { getAgentEnvVarNames, runnerReadiness, type Clanker, type ModelEndpoint } from "@viberglass/types";
import { ModelEndpointDAO } from "../persistence/modelEndpoint/ModelEndpointDAO";
import { RunnerLastRunDAO } from "../persistence/job/RunnerLastRunDAO";
import { SecretDAO } from "../persistence/secret/SecretDAO";

interface Dependencies {
  secrets: Pick<SecretDAO, "getSecretsByIds">;
  runs: Pick<RunnerLastRunDAO, "latestFinishedByClanker">;
  endpoints: Pick<ModelEndpointDAO, "get">;
}

/**
 * Works out whether runners can take a task, from their configuration, their
 * secrets and their latest runs. A rejected credential stops counting once
 * someone changes the runner or its key after that run.
 */
export class ClankerReadinessService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { secrets: new SecretDAO(), runs: new RunnerLastRunDAO(), endpoints: new ModelEndpointDAO(), ...deps };
  }

  async withReadiness(clankers: Clanker[]): Promise<Clanker[]> {
    if (clankers.length === 0) return clankers;
    const endpointIds = [...new Set(clankers.flatMap((clanker) => clanker.modelEndpoint ? [clanker.modelEndpoint.endpointId] : []))];
    const endpoints = new Map(await Promise.all(endpointIds.map(async (id): Promise<[string, ModelEndpoint | null]> => [id, await this.deps.endpoints.get(id)])));
    const secretIds = [...new Set([
      ...clankers.flatMap((clanker) => clanker.secretBindings.map((binding) => binding.secretId)),
      ...Array.from(endpoints.values()).flatMap((endpoint) => endpoint?.secretId ? [endpoint.secretId] : []),
    ])];
    const [secrets, lastRuns] = await Promise.all([
      this.deps.secrets.getSecretsByIds(secretIds),
      this.deps.runs.latestFinishedByClanker(clankers.map((clanker) => clanker.id)),
    ]);
    const existing = new Set(secrets.map((secret) => secret.id));
    const secretChangedAt = new Map(secrets.map((secret) => [secret.id, secret.updatedAt.getTime()]));

    return clankers.map((clanker) => {
      const lastRun = lastRuns.get(clanker.id) ?? null;
      const endpoint = clanker.modelEndpoint ? endpoints.get(clanker.modelEndpoint.endpointId) : null;
      const changed = lastRun ? this.changedSince(clanker, secretChangedAt, Date.parse(lastRun.at), endpoint) : false;
      const readiness = runnerReadiness(clanker, existing, changed ? null : lastRun);
      return { ...clanker, readiness: { ...readiness, lastRun } };
    });
  }

  async one(clanker: Clanker): Promise<Clanker> {
    const [withReadiness] = await this.withReadiness([clanker]);
    return withReadiness;
  }

  private changedSince(clanker: Clanker, secretChangedAt: Map<string, number>, runAt: number, endpoint?: ModelEndpoint | null): boolean {
    if (Date.parse(clanker.updatedAt) > runAt) return true;
    if (endpoint) {
      return Date.parse(endpoint.updatedAt) > runAt || Boolean(endpoint.secretId && (secretChangedAt.get(endpoint.secretId) ?? 0) > runAt);
    }
    const keyVars = new Set(clanker.agent ? getAgentEnvVarNames(clanker.agent).apiKey : []);
    return clanker.secretBindings.some((binding) => keyVars.has(binding.envVar) && (secretChangedAt.get(binding.secretId) ?? 0) > runAt);
  }
}
