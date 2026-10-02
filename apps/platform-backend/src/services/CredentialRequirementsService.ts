import type { Clanker, CredentialRequest } from "@viberglass/types";
import { getCodexAgentConfig } from "../clanker-config";
import { SecretResolutionService } from "./SecretResolutionService";
import { CodexLoginService, usesChatGptLogin } from "./codexLogin/CodexLoginService";
import { secretsSsmPrefix } from "./secretStorageDefaults";

export class CredentialRequirementsService {
  constructor(
    private readonly secretResolutionService: Pick<SecretResolutionService, "getCredentialRequests"> = new SecretResolutionService(),
    private readonly codexLogins: Pick<CodexLoginService, "workerBindings"> = new CodexLoginService(),
  ) {}

  async getRequiredCredentialsForClanker(clanker: Clanker): Promise<CredentialRequest[]> {
    const requests = await this.secretResolutionService.getCredentialRequests(clanker.secretBindings || []);
    if (!usesChatGptLogin(clanker)) return requests;

    const secretName = getCodexAgentConfig(clanker)?.codexAuth.secretName;
    const loginBindings = this.codexLogins.workerBindings(clanker);
    if (loginBindings.length > 0) {
      const loginRequests = (await this.secretResolutionService.getCredentialRequests(loginBindings)).map(
        (request) => ({ ...request, exposeToAgent: false }),
      );
      return [...requests.filter((request) => request.envVar !== secretName), ...loginRequests];
    }

    // Not connected yet: the shared login cache, kept at the prefix plus its name.
    if (!secretName || requests.some((request) => request.envVar === secretName)) return requests;
    return [...requests, { envVar: secretName, ssmPath: `${secretsSsmPrefix()}/${secretName}` }];
  }
}
