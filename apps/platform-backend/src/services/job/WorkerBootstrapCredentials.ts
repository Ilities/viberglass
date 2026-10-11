import { isObjectRecord, parseSecretBindings } from "@viberglass/types";
import type { SecretResolutionService } from "../SecretResolutionService";

export class WorkerBootstrapCredentials {
  constructor(private readonly secrets: Pick<SecretResolutionService, "resolveBindings">) {}

  async resolve(payload: Record<string, unknown>): Promise<Record<string, string>> {
    const requests = payload.requiredCredentials;
    if (!Array.isArray(requests) || !requests.every((request: unknown) =>
      isObjectRecord(request) && typeof request.envVar === "string")) {
      throw new Error("Worker bootstrap has an invalid credential allowlist");
    }
    const values = await this.secrets.resolveBindings(parseSecretBindings(payload.credentialBindings));
    const credentials: Record<string, string> = {};
    const optional = Array.isArray(payload.optionalCredentials) ? payload.optionalCredentials : [];
    for (const request of requests) {
      const name = request.envVar;
      const value = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
      if (value === undefined && optional.includes(name)) continue;
      if (value === undefined) throw new Error(`Required worker credential is unavailable: ${name}`);
      Object.defineProperty(credentials, name, { value, enumerable: true });
    }
    return credentials;
  }
}
