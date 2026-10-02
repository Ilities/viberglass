import type { SecretService } from "../SecretService";

export class WorkerBootstrapCredentials {
  constructor(private readonly secrets: Pick<SecretService, "resolveNamedSecret">) {}

  async resolve(payload: Record<string, unknown>): Promise<Record<string, string>> {
    const names = payload.requiredCredentials;
    if (!Array.isArray(names) || !names.every((name): name is string => typeof name === "string")) {
      throw new Error("Worker bootstrap has an invalid credential allowlist");
    }
    const credentials: Record<string, string> = {};
    const optional = Array.isArray(payload.optionalCredentials) ? payload.optionalCredentials : [];
    for (const name of new Set(names)) {
      const value = await this.secrets.resolveNamedSecret(name);
      if (value === undefined && optional.includes(name)) continue;
      if (value === undefined) throw new Error(`Required worker credential is unavailable: ${name}`);
      Object.defineProperty(credentials, name, { value, enumerable: true });
    }
    return credentials;
  }
}
