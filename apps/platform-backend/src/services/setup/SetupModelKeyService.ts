import {
  AGENT_LABELS,
  describeModelKeyFormatProblem,
  getDefaultAgentBindingForProvider,
  getModelProvider,
  type ModelProviderId,
  type SavedModelKey,
} from "@viberglass/types";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import { ModelKeyChecker } from "./ModelKeyChecker";
import { SetupSecretStore } from "./SetupSecretStore";

interface KeyChecker {
  check(provider: ModelProviderId, key: string): Promise<void>;
}


/**
 * Setup step "Connect an AI model": checks the key with the provider, then
 * saves it under the env var its default harness reads (see SetupSecretStore).
 */
export class SetupModelKeyService {
  constructor(
    private readonly checker: KeyChecker = new ModelKeyChecker(),
    private readonly secrets: Pick<SetupSecretStore, "saveByName"> = new SetupSecretStore(),
  ) {}

  async saveModelKey(providerId: ModelProviderId, rawKey: string): Promise<SavedModelKey> {
    const key = rawKey.trim();
    const formatProblem = describeModelKeyFormatProblem(providerId, key);
    if (formatProblem) {
      throw new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_FORMAT_INVALID, formatProblem);
    }

    const provider = getModelProvider(providerId);
    const binding = getDefaultAgentBindingForProvider(providerId);
    if (!binding) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.NO_HARNESS_FOR_PROVIDER,
        `No agent can run ${provider.displayName} keys in this version of Viberglass.`,
      );
    }

    await this.checker.check(providerId, key);
    const secretId = await this.secrets.saveByName(binding.envVar, key);

    return {
      provider: providerId,
      providerName: provider.displayName,
      agent: binding.agent,
      agentName: AGENT_LABELS[binding.agent],
      secretId,
      secretName: binding.envVar,
    };
  }
}
