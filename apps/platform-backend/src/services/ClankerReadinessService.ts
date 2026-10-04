import { getAgentEnvVarNames, runnerReadiness, type Clanker } from "@viberglass/types";
import { RunnerLastRunDAO } from "../persistence/job/RunnerLastRunDAO";
import { SecretDAO } from "../persistence/secret/SecretDAO";

interface Dependencies {
  secrets: Pick<SecretDAO, "getSecretsByIds">;
  runs: Pick<RunnerLastRunDAO, "latestFinishedByClanker">;
}

/**
 * Works out whether runners can take a task, from their configuration, their
 * secrets and their latest runs. A rejected credential stops counting once
 * someone changes the runner or its key after that run.
 */
export class ClankerReadinessService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { secrets: new SecretDAO(), runs: new RunnerLastRunDAO(), ...deps };
  }

  async withReadiness(clankers: Clanker[]): Promise<Clanker[]> {
    if (clankers.length === 0) return clankers;
    const secretIds = [...new Set(clankers.flatMap((clanker) => clanker.secretBindings.map((binding) => binding.secretId)))];
    const [secrets, lastRuns] = await Promise.all([
      this.deps.secrets.getSecretsByIds(secretIds),
      this.deps.runs.latestFinishedByClanker(clankers.map((clanker) => clanker.id)),
    ]);
    const existing = new Set(secrets.map((secret) => secret.id));
    const secretChangedAt = new Map(secrets.map((secret) => [secret.id, secret.updatedAt.getTime()]));

    return clankers.map((clanker) => {
      const lastRun = lastRuns.get(clanker.id) ?? null;
      const changed = lastRun ? this.changedSince(clanker, secretChangedAt, Date.parse(lastRun.at)) : false;
      const readiness = runnerReadiness(clanker, existing, changed ? null : lastRun);
      return { ...clanker, readiness: { ...readiness, lastRun } };
    });
  }

  async one(clanker: Clanker): Promise<Clanker> {
    const [withReadiness] = await this.withReadiness([clanker]);
    return withReadiness;
  }

  private changedSince(clanker: Clanker, secretChangedAt: Map<string, number>, runAt: number): boolean {
    if (Date.parse(clanker.updatedAt) > runAt) return true;
    const keyVars = new Set(clanker.agent ? getAgentEnvVarNames(clanker.agent).apiKey : []);
    return clanker.secretBindings.some((binding) => keyVars.has(binding.envVar) && (secretChangedAt.get(binding.secretId) ?? 0) > runAt);
  }
}
