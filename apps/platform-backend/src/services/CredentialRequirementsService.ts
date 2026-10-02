import type { Clanker, CredentialRequest } from "@viberglass/types";
import { getCodexAgentConfig } from "../clanker-config";
import { SecretResolutionService } from "./SecretResolutionService";
import { secretsSsmPrefix } from "./secretStorageDefaults";

export class CredentialRequirementsService {
  constructor(
    private readonly secretResolutionService: Pick<SecretResolutionService, "getCredentialRequests"> = new SecretResolutionService(),
  ) {}

  async getRequiredCredentialsForClanker(clanker: Clanker): Promise<CredentialRequest[]> {
    const requests = await this.secretResolutionService.getCredentialRequests(clanker.secretBindings || []);

    const codexAgentConfig = getCodexAgentConfig(clanker);
    if (codexAgentConfig) {
      const codexMode = codexAgentConfig.codexAuth.mode;
      const secretName = codexAgentConfig.codexAuth.secretName;
      if (
        (codexMode === "chatgpt_device" || codexMode === "chatgpt_device_stored") &&
        secretName &&
        !requests.some((request) => request.envVar === secretName)
      ) {
        // The shared Codex login cache, kept at the prefix plus its name.
        requests.push({ envVar: secretName, ssmPath: `${secretsSsmPrefix()}/${secretName}` });
      }
    }

    return requests;
  }
}
