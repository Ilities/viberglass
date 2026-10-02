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
 * saves it as that provider's key (see SetupSecretStore).
 */
export class SetupModelKeyService {
  constructor(
    private readonly checker: KeyChecker = new ModelKeyChecker(),
    private readonly secrets: Pick<SetupSecretStore, "saveForProvider"> = new SetupSecretStore(),
  ) {}

  /** Checks the key's format and then with the provider; saves nothing. */
  async checkModelKey(providerId: ModelProviderId, rawKey: string): Promise<void> {
    const key = rawKey.trim();
    const formatProblem = describeModelKeyFormatProblem(providerId, key);
    if (formatProblem) {
      throw new SetupServiceError(SETUP_SERVICE_ERROR_CODE.KEY_FORMAT_INVALID, formatProblem);
    }
    await this.checker.check(providerId, key);
  }

  async saveModelKey(providerId: ModelProviderId, rawKey: string): Promise<SavedModelKey> {
    const key = rawKey.trim();
    const provider = getModelProvider(providerId);
    const binding = getDefaultAgentBindingForProvider(providerId);
    if (!binding) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.NO_HARNESS_FOR_PROVIDER,
        `No agent can run ${provider.displayName} keys in this version of Viberglass.`,
      );
    }

    await this.checkModelKey(providerId, key);
    const secretId = await this.secrets.saveForProvider(providerId, `${provider.displayName} key`, key);

    return {
      provider: providerId,
      providerName: provider.displayName,
      agent: binding.agent,
      agentName: AGENT_LABELS[binding.agent],
      secretId,
    };
  }
}
