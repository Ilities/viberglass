import type {
  Integration,
  IntegrationCredential,
  RepositoryAccess,
  SavedRepository,
  UpdateIntegrationCredentialRequest,
} from "@viberglass/types";
import {
  IntegrationDAO,
  type CreateIntegrationInput,
} from "../../persistence/integrations/IntegrationDAO";
import {
  IntegrationCredentialDAO,
  type CreateIntegrationCredentialInput,
} from "../../persistence/integrations/IntegrationCredentialDAO";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import { RepositoryAccessError, type RepositoryRef } from "@viberglass/integration-core";
import { SetupSecretStore } from "./SetupSecretStore";
import { findSetupCodeHost, requireSetupCodeHost, type SetupCodeHost } from "./setupCodeHost";

interface Integrations {
  listIntegrations(system: string): Promise<Integration[]>;
  createIntegration(input: CreateIntegrationInput): Promise<Integration>;
}

interface Credentials {
  listByIntegrationId(integrationId: string): Promise<IntegrationCredential[]>;
  create(input: CreateIntegrationCredentialInput): Promise<IntegrationCredential>;
  update(id: string, input: UpdateIntegrationCredentialRequest): Promise<IntegrationCredential | null>;
}

/**
 * Setup step "Point at your repository": checks that the token can read and
 * push to the repository, then saves it as the code host connection's default
 * credential. The connection and credential are reused when they exist, so
 * running setup again replaces the token instead of adding another.
 */
export class SetupRepositoryService {
  constructor(
    private readonly codeHost: () => SetupCodeHost | null = findSetupCodeHost,
    private readonly integrations: Integrations = new IntegrationDAO(),
    private readonly credentials: Credentials = new IntegrationCredentialDAO(),
    private readonly secrets: Pick<SetupSecretStore, "saveByName" | "replaceById"> = new SetupSecretStore(),
  ) {}

  async saveRepository(repository: string, rawToken: string): Promise<SavedRepository> {
    const codeHost = requireSetupCodeHost(this.codeHost);
    const ref = codeHost.repository.parseRepository(repository);
    if (!ref) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_INVALID,
        `Enter the repository as owner/name or its ${codeHost.label} address, for example acme/web.`,
      );
    }
    const token = rawToken.trim();
    if (!token || /\s/.test(token)) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.TOKEN_FORMAT_INVALID,
        "Paste the access token on its own; a token doesn't contain spaces.",
      );
    }

    const access = await this.checkAccess(codeHost, ref, token);
    const integration = await this.findOrCreateIntegration(codeHost);
    const credentialId = await this.saveToken(codeHost, integration.id, token);
    return { ...access, integrationId: integration.id, credentialId };
  }

  private async checkAccess(codeHost: SetupCodeHost, ref: RepositoryRef, token: string): Promise<RepositoryAccess> {
    try {
      return await codeHost.repository.checkAccess(ref, token);
    } catch (error) {
      if (error instanceof RepositoryAccessError) {
        throw new SetupServiceError(SETUP_SERVICE_ERROR_CODE[error.code], error.message);
      }
      throw error;
    }
  }

  private async findOrCreateIntegration(codeHost: SetupCodeHost): Promise<Integration> {
    const existing = (await this.integrations.listIntegrations(codeHost.system)).find((i) => i.isActive);
    return existing ?? this.integrations.createIntegration({ name: codeHost.label, system: codeHost.system, config: {} });
  }

  private async saveToken(codeHost: SetupCodeHost, integrationId: string, token: string): Promise<string> {
    const tokens = (await this.credentials.listByIntegrationId(integrationId)).filter(
      (credential) => credential.credentialType === "token",
    );
    const current = tokens.find((credential) => credential.isDefault) ?? tokens[0];
    if (current) {
      await this.secrets.replaceById(current.secretId, token);
      if (!current.isDefault) await this.credentials.update(current.id, { isDefault: true });
      return current.id;
    }

    const secretName = `${codeHost.system.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_TOKEN`;
    const secretId = await this.secrets.saveByName(secretName, token);
    const created = await this.credentials.create({
      integrationId,
      name: `${codeHost.label} token`,
      credentialType: "token",
      secretId,
      isDefault: true,
    });
    return created.id;
  }
}
