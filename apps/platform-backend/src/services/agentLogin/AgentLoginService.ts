import { getRunnerSignIn, isClankerConfigV1, type Clanker, type SecretBinding } from "@viberglass/types";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { encodeLoginForSsm, SecretService, type SecretInput, type SecretUpdate } from "../SecretService";
import { setupSecretLocation } from "../secretStorageDefaults";

interface Runners {
  getClanker(id: string): Promise<Clanker | null>;
  updateClanker(id: string, updates: { deploymentConfig: Record<string, unknown> }): Promise<Clanker>;
}

interface StoredLogin {
  id: string;
  secretLocation: string;
}

interface Secrets {
  getSecret(id: string): Promise<StoredLogin | null>;
  createSecret(input: SecretInput): Promise<StoredLogin>;
  updateSecret(id: string, updates: SecretUpdate): Promise<StoredLogin>;
}

/** A login a runner can't keep: it doesn't exist, or it signs in with an API key. */
export class AgentLoginNotApplicableError extends Error {}

/** Whether a runner signs its harness in interactively, such as Codex with a ChatGPT account, rather than with an API key. */
export function usesInteractiveSignIn(clanker: Pick<Clanker, "deploymentConfig">): boolean {
  return getRunnerSignIn(clanker.deploymentConfig) !== null;
}

/**
 * A runner's interactive login: one stored secret per runner, so two runners never
 * race to refresh the same tokens. The worker uploads it after signing in and after
 * any run in which the harness refreshed it.
 */
export class AgentLoginService {
  constructor(
    private readonly runners: Runners = new ClankerDAO(),
    private readonly secrets: Secrets = new SecretService(),
    private readonly location: "database" | "ssm" = setupSecretLocation(),
  ) {}

  /** The runner's stored login, as the worker reads it. It is the worker's, never the agent's. */
  workerBindings(clanker: Pick<Clanker, "deploymentConfig">): SecretBinding[] {
    const runnerSignIn = getRunnerSignIn(clanker.deploymentConfig);
    const loginSecretId = runnerSignIn?.signIn.loginSecretId;
    return runnerSignIn && loginSecretId ? [{ envVar: runnerSignIn.method.credentialEnvVar, secretId: loginSecretId }] : [];
  }

  /** Stores a login the runner's worker uploaded, creating the runner's login secret the first time. */
  async saveLogin(clankerId: string, credential: string): Promise<StoredLogin> {
    const clanker = await this.runners.getClanker(clankerId);
    const runnerSignIn = clanker ? getRunnerSignIn(clanker.deploymentConfig) : null;
    if (!clanker || !runnerSignIn) {
      throw new AgentLoginNotApplicableError(`Runner ${clankerId} has no interactive sign-in to keep a login for`);
    }

    const existing = runnerSignIn.signIn.loginSecretId ? await this.secrets.getSecret(runnerSignIn.signIn.loginSecretId) : null;
    if (existing) {
      return this.secrets.updateSecret(existing.id, { secretValue: this.encode(credential, existing.secretLocation) });
    }

    const created = await this.secrets.createSecret({
      name: `${clanker.name} · ${runnerSignIn.method.label}`,
      purpose: "agent_login",
      secretLocation: this.location,
      secretValue: this.encode(credential, this.location),
    });
    await this.linkLogin(clanker, created.id);
    return created;
  }

  // SSM parameters have a size limit, so the login is compacted (and if need be gzipped) there.
  private encode(credential: string, location: string): string {
    return location === "ssm" ? encodeLoginForSsm(credential) : credential;
  }

  private async linkLogin(clanker: Clanker, secretId: string): Promise<void> {
    const config = clanker.deploymentConfig;
    if (!isClankerConfigV1(config) || !config.agent.signIn) {
      throw new AgentLoginNotApplicableError(`Runner ${clanker.id} has no sign-in to link a login to`);
    }
    await this.runners.updateClanker(clanker.id, {
      deploymentConfig: { ...config, agent: { ...config.agent, signIn: { ...config.agent.signIn, loginSecretId: secretId } } },
    });
  }
}
