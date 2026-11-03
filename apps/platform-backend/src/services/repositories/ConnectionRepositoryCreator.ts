import { RepositoryAccessError, type RepositoryCreator, type RepositoryHost } from "@viberglass/integration-core";
import type { NewRepository, RepositoryAccess, RepositoryOwner } from "@viberglass/types";
import type { IntegrationDAO } from "../../persistence/integrations/IntegrationDAO";
import type { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import type { SecretResolutionService } from "../SecretResolutionService";
import type { CodeHosts } from "./codeHosts";
import { createCheckedRepository } from "./createCheckedRepository";
import { RepositoryCreationError } from "./RepositoryCreationError";

interface Creation {
  host: RepositoryHost;
  creator: RepositoryCreator;
  token: string;
}

/** Creates repositories with a workspace code host connection's token: the chosen one, else its default. */
export class ConnectionRepositoryCreator {
  constructor(
    private readonly integrations: Pick<IntegrationDAO, "getIntegration">,
    private readonly credentials: Pick<IntegrationCredentialDAO, "getById" | "getDefaultForIntegration">,
    private readonly secrets: Pick<SecretResolutionService, "resolveSecretValue">,
    private readonly plugins: CodeHosts,
  ) {}

  async listOwners(integrationId: string, credentialId: string | null): Promise<RepositoryOwner[]> {
    const { creator, token } = await this.resolve(integrationId, credentialId);
    return withCreationErrors(creator.listOwners(token));
  }

  async create(integrationId: string, credentialId: string | null, repository: NewRepository): Promise<RepositoryAccess> {
    const { host, creator, token } = await this.resolve(integrationId, credentialId);
    return withCreationErrors(createCheckedRepository(host, creator, repository, token));
  }

  private async resolve(integrationId: string, credentialId: string | null): Promise<Creation> {
    const integration = await this.integrations.getIntegration(integrationId);
    if (!integration) throw new RepositoryCreationError("CONNECTION_NOT_FOUND", "That connection doesn't exist any more.");
    const host = this.plugins.get(integration.system)?.repository;
    if (!host?.creator) {
      throw new RepositoryCreationError("CREATION_UNSUPPORTED", `${integration.name} can't create repositories. Use an existing repository instead.`);
    }

    const credential = credentialId
      ? await this.credentials.getById(credentialId)
      : await this.credentials.getDefaultForIntegration(integrationId);
    const usable = credential && credential.integrationId === integrationId && credential.credentialType === "token";
    const token = usable ? (await this.secrets.resolveSecretValue(credential.secretId))?.trim() : undefined;
    if (!token) {
      throw new RepositoryCreationError(
        "NO_TOKEN",
        credentialId
          ? `That access token can't be used with ${integration.name}. Choose another one.`
          : `Choose which ${integration.name} access token to create the repository with.`,
      );
    }
    return { host, creator: host.creator, token };
  }
}

async function withCreationErrors<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof RepositoryAccessError) throw new RepositoryCreationError(error.code, error.message);
    throw error;
  }
}
