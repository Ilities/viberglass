import {
  AGENT_LABELS,
  describeModelKeyFormatProblem,
  getDefaultAgentBindingForProvider,
  getModelProvider,
  type AgentType,
  type ModelProviderId,
} from "@viberglass/types";
import { SecretDAO, type SecretLocation } from "../../persistence/secret/SecretDAO";
import { SecretService, type SecretInput, type SecretUpdate } from "../SecretService";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import { ModelKeyChecker } from "./ModelKeyChecker";

export interface SavedModelKey {
  provider: ModelProviderId;
  providerName: string;
  /** The harness setup will run this key with. */
  agent: AgentType;
  agentName: string;
  secretId: string;
  secretName: string;
}

interface KeyChecker {
  check(provider: ModelProviderId, key: string): Promise<void>;
}

interface SecretLookup {
  getSecretByName(name: string): Promise<{ id: string; secretLocation: SecretLocation } | null>;
}

interface SecretWriter {
  createSecret(input: SecretInput): Promise<{ id: string }>;
  updateSecret(id: string, updates: SecretUpdate): Promise<{ id: string }>;
}

/**
 * Setup step "Connect an AI model": checks the key with the provider, then
 * stores it encrypted in the database under the env var its default harness
 * reads. Saving again for the same provider replaces the stored key.
 */
export class SetupModelKeyService {
  constructor(
    private readonly checker: KeyChecker = new ModelKeyChecker(),
    private readonly secretLookup: SecretLookup = new SecretDAO(),
    private readonly secretWriter: SecretWriter = new SecretService(),
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
    const secretId = await this.storeKey(binding.envVar, key);

    return {
      provider: providerId,
      providerName: provider.displayName,
      agent: binding.agent,
      agentName: AGENT_LABELS[binding.agent],
      secretId,
      secretName: binding.envVar,
    };
  }

  private async storeKey(secretName: string, key: string): Promise<string> {
    const existing = await this.secretLookup.getSecretByName(secretName);
    if (existing?.secretLocation === "env") {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.SECRET_MANAGED_ELSEWHERE,
        `${secretName} is read from the server's environment, so setup can't change it. Update it where the server is configured, or remove that secret under Settings → Secrets.`,
      );
    }
    if (existing) {
      // Keep the key where it's stored (database or SSM); moving it would delete the SSM copy.
      const updated = await this.secretWriter.updateSecret(existing.id, { secretValue: key });
      return updated.id;
    }

    const created = await this.secretWriter.createSecret({
      name: secretName,
      secretLocation: "database",
      secretValue: key,
    });
    return created.id;
  }
}
