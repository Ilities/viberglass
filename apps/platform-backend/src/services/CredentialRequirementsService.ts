import type { Clanker } from "@viberglass/types";
import { getCodexAgentConfig } from "../clanker-config";
import { SecretResolutionService } from "./SecretResolutionService";

export class CredentialRequirementsService {
  private secretResolutionService = new SecretResolutionService();

  async getRequiredCredentialsForClanker(clanker: Clanker): Promise<string[]> {
    const secretMetadata =
      await this.secretResolutionService.getSecretMetadataForClanker(
        clanker.secretIds || [],
      );
    const requiredCredentialSet = new Set(
      secretMetadata.map((secret) => secret.name),
    );

    const codexAgentConfig = getCodexAgentConfig(clanker);
    if (
      codexAgentConfig?.codexAuth.mode === "chatgpt_device" &&
      codexAgentConfig.codexAuth.secretName
    ) {
      requiredCredentialSet.add(codexAgentConfig.codexAuth.secretName);
    }

    return Array.from(requiredCredentialSet);
  }
}
