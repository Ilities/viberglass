import type {
  Integration,
  IntegrationCredential,
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
import { GitHubRepositoryChecker, type RepositoryAccess } from "./GitHubRepositoryChecker";
import { parseGitHubRepository, type GitHubRepositoryRef } from "./gitHubRepository";
import { SetupSecretStore } from "./SetupSecretStore";

const TOKEN_SECRET_NAME = "GITHUB_TOKEN";

export interface SavedRepository extends RepositoryAccess {
  integrationId: string;
  credentialId: string;
}

interface RepositoryChecker {
  check(ref: GitHubRepositoryRef, token: string): Promise<RepositoryAccess>;
}

interface Integrations {
  listIntegrations(system: "github"): Promise<Integration[]>;
  createIntegration(input: CreateIntegrationInput): Promise<Integration>;
}

interface Credentials {
  listByIntegrationId(integrationId: string): Promise<IntegrationCredential[]>;
  create(input: CreateIntegrationCredentialInput): Promise<IntegrationCredential>;
  update(id: string, input: UpdateIntegrationCredentialRequest): Promise<IntegrationCredential | null>;
}

/**
 * Setup step "Point at your repository": checks that the token can read and
 * push to the repository, then saves it as the GitHub connection's default
 * credential. The connection and credential are reused when they exist, so
 * running setup again replaces the token instead of adding another.
 */
export class SetupRepositoryService {
  constructor(
    private readonly checker: RepositoryChecker = new GitHubRepositoryChecker(),
    private readonly integrations: Integrations = new IntegrationDAO(),
    private readonly credentials: Credentials = new IntegrationCredentialDAO(),
    private readonly secrets: Pick<SetupSecretStore, "saveByName" | "replaceById"> = new SetupSecretStore(),
  ) {}

  async saveRepository(repository: string, rawToken: string): Promise<SavedRepository> {
    const ref = parseGitHubRepository(repository);
    if (!ref) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.REPOSITORY_INVALID,
        "Enter the repository as owner/name or its GitHub address, for example acme/web.",
      );
    }
    const token = rawToken.trim();
    if (!token || /\s/.test(token)) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.TOKEN_FORMAT_INVALID,
        "Paste the access token on its own; a token doesn't contain spaces.",
      );
    }

    const access = await this.checker.check(ref, token);
    const integration = await this.findOrCreateGitHubIntegration();
    const credentialId = await this.saveToken(integration.id, token);
    return { ...access, integrationId: integration.id, credentialId };
  }

  private async findOrCreateGitHubIntegration(): Promise<Integration> {
    const existing = (await this.integrations.listIntegrations("github")).find((i) => i.isActive);
    return existing ?? this.integrations.createIntegration({ name: "GitHub", system: "github", config: {} });
  }

  private async saveToken(integrationId: string, token: string): Promise<string> {
    const tokens = (await this.credentials.listByIntegrationId(integrationId)).filter(
      (credential) => credential.credentialType === "token",
    );
    const current = tokens.find((credential) => credential.isDefault) ?? tokens[0];
    if (current) {
      await this.secrets.replaceById(current.secretId, token);
      if (!current.isDefault) await this.credentials.update(current.id, { isDefault: true });
      return current.id;
    }

    const secretId = await this.secrets.saveByName(TOKEN_SECRET_NAME, token);
    const created = await this.credentials.create({
      integrationId,
      name: "GitHub token",
      credentialType: "token",
      secretId,
      isDefault: true,
    });
    return created.id;
  }
}
