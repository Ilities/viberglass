import { isClankerConfigV1, type Clanker, type SecretBinding } from "@viberglass/types";
import { getCodexAgentConfig } from "../../clanker-config";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DEFAULT_CODEX_AUTH_SECRET_NAME } from "../../clanker-config/agents/codex";
import { encodeCodexAuthForSsm, SecretService, type SecretInput, type SecretUpdate } from "../SecretService";
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

/** Whether a runner signs Codex in with a ChatGPT account rather than an API key. */
export function usesChatGptLogin(clanker: Clanker): boolean {
  const mode = getCodexAgentConfig(clanker)?.codexAuth.mode;
  return mode === "chatgpt_device" || mode === "chatgpt_device_stored";
}

/**
 * A Codex runner's ChatGPT login: one stored secret per runner, so two runners never
 * race to refresh the same tokens. The worker uploads it after signing in and after
 * any run in which Codex refreshed it.
 */
export class CodexLoginService {
  constructor(
    private readonly runners: Runners = new ClankerDAO(),
    private readonly secrets: Secrets = new SecretService(),
    private readonly location: "database" | "ssm" = setupSecretLocation(),
  ) {}

  /** The runner's stored login, as the worker reads it. It is the worker's, never the agent's. */
  workerBindings(clanker: Clanker): SecretBinding[] {
    const loginSecretId = getCodexAgentConfig(clanker)?.codexAuth.loginSecretId;
    return usesChatGptLogin(clanker) && loginSecretId
      ? [{ envVar: DEFAULT_CODEX_AUTH_SECRET_NAME, secretId: loginSecretId }]
      : [];
  }

  /** Stores a login the runner's worker uploaded, creating the runner's login secret the first time. */
  async saveLogin(clankerId: string, authJson: string): Promise<StoredLogin> {
    const clanker = await this.runners.getClanker(clankerId);
    if (!clanker) throw new Error(`Runner ${clankerId} not found`);

    const loginSecretId = getCodexAgentConfig(clanker)?.codexAuth.loginSecretId;
    const existing = loginSecretId ? await this.secrets.getSecret(loginSecretId) : null;
    if (existing) {
      return this.secrets.updateSecret(existing.id, { secretValue: this.encode(authJson, existing.secretLocation) });
    }

    const created = await this.secrets.createSecret({
      name: `ChatGPT login · ${clanker.name}`,
      purpose: "codex_login",
      secretLocation: this.location,
      secretValue: this.encode(authJson, this.location),
    });
    await this.linkLogin(clanker, created.id);
    return created;
  }

  // SSM parameters have a size limit, so the login is compacted (and if need be gzipped) there.
  private encode(authJson: string, location: string): string {
    return location === "ssm" ? encodeCodexAuthForSsm(authJson) : authJson;
  }

  private async linkLogin(clanker: Clanker, secretId: string): Promise<void> {
    const config = clanker.deploymentConfig;
    if (!isClankerConfigV1(config) || config.agent.type !== "codex") {
      throw new Error(`Runner ${clanker.id} has no Codex config to link a login to`);
    }
    await this.runners.updateClanker(clanker.id, {
      deploymentConfig: {
        ...config,
        agent: { ...config.agent, codexAuth: { ...config.agent.codexAuth, loginSecretId: secretId } },
      },
    });
  }
}
