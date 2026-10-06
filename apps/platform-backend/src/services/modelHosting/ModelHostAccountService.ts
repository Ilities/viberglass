import type {
  ModelHostAccount,
  ModelHostAccountInput,
} from "@viberglass/types";
import type {
  ModelHostAccountDAO,
  ModelHostAccountRecord,
} from "../../persistence/modelHosting/ModelHostAccountDAO";
import type { SecretService } from "../SecretService";
import { ModelHostingError } from "../errors/ModelHostingError";

type Secrets = Pick<
  SecretService,
  "createSecret" | "updateSecret" | "deleteSecret"
>;

function toPublic(record: ModelHostAccountRecord): ModelHostAccount {
  return {
    id: record.id,
    name: record.name,
    host: record.host,
    clientId: record.clientId,
    hasHuggingFaceToken: record.hasHuggingFaceToken,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Cloud accounts; their credentials are platform-managed secrets nobody picks elsewhere. */
export class ModelHostAccountService {
  constructor(
    private readonly accounts: ModelHostAccountDAO,
    private readonly secrets: Secrets,
    private readonly secretLocation: "database" | "ssm",
  ) {}

  async list(): Promise<ModelHostAccount[]> {
    return (await this.accounts.list()).map(toPublic);
  }

  async require(id: string): Promise<ModelHostAccountRecord> {
    const account = await this.accounts.get(id);
    if (!account)
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_NOT_FOUND",
        "Cloud account not found",
        404,
      );
    return account;
  }

  async create(input: ModelHostAccountInput): Promise<ModelHostAccount> {
    await this.assertNameAvailable(input.name);
    if (!input.clientSecret || !input.endpointKey)
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_INVALID",
        "Enter the client secret and the inference key.",
      );
    const created: string[] = [];
    const store = async (label: string, value: string) => {
      const secret = await this.secrets.createSecret({
        name: `${input.name} · ${label}`,
        purpose: "model_host",
        secretLocation: this.secretLocation,
        secretValue: value,
      });
      created.push(secret.id);
      return secret.id;
    };
    try {
      return toPublic(
        await this.accounts.create({
          name: input.name,
          host: input.host,
          clientId: input.clientId,
          clientSecretId: await store("client secret", input.clientSecret),
          endpointKeySecretId: await store("inference key", input.endpointKey),
          huggingFaceTokenSecretId: input.huggingFaceToken
            ? await store("Hugging Face token", input.huggingFaceToken)
            : null,
        }),
      );
    } catch (error) {
      await Promise.all(created.map((id) => this.secrets.deleteSecret(id)));
      throw error;
    }
  }

  async update(
    id: string,
    input: ModelHostAccountInput,
  ): Promise<ModelHostAccount> {
    const account = await this.require(id);
    await this.assertNameAvailable(input.name, id);
    if (input.host !== account.host)
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_INVALID",
        "An account's cloud can't change.",
      );
    if (input.clientSecret)
      await this.secrets.updateSecret(account.clientSecretId, {
        secretValue: input.clientSecret,
      });
    if (input.endpointKey)
      await this.secrets.updateSecret(account.endpointKeySecretId, {
        secretValue: input.endpointKey,
      });
    const huggingFaceTokenSecretId = await this.replaceHuggingFaceToken(
      account,
      input,
    );
    const updated = await this.accounts.update(id, {
      name: input.name,
      host: account.host,
      clientId: input.clientId,
      clientSecretId: account.clientSecretId,
      endpointKeySecretId: account.endpointKeySecretId,
      huggingFaceTokenSecretId,
    });
    if (
      account.huggingFaceTokenSecretId &&
      account.huggingFaceTokenSecretId !== huggingFaceTokenSecretId
    )
      await this.secrets.deleteSecret(account.huggingFaceTokenSecretId);
    return toPublic(updated ?? (await this.require(id)));
  }

  async delete(id: string): Promise<void> {
    const account = await this.require(id);
    const deployments = await this.accounts.deploymentNames(id);
    if (deployments.length)
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_IN_USE",
        `Delete these deployments first: ${deployments.join(", ")}.`,
        409,
      );
    await this.accounts.delete(id);
    await Promise.all(
      [
        account.clientSecretId,
        account.endpointKeySecretId,
        account.huggingFaceTokenSecretId,
      ].flatMap((secretId) =>
        secretId ? [this.secrets.deleteSecret(secretId)] : [],
      ),
    );
  }

  /** Keeps, replaces or removes the token; the returned id is what the account stores. */
  private async replaceHuggingFaceToken(
    account: ModelHostAccountRecord,
    input: ModelHostAccountInput,
  ): Promise<string | null> {
    if (input.huggingFaceToken === undefined)
      return account.huggingFaceTokenSecretId;
    if (!input.huggingFaceToken) return null;
    if (account.huggingFaceTokenSecretId) {
      await this.secrets.updateSecret(account.huggingFaceTokenSecretId, {
        secretValue: input.huggingFaceToken,
      });
      return account.huggingFaceTokenSecretId;
    }
    return (
      await this.secrets.createSecret({
        name: `${input.name} · Hugging Face token`,
        purpose: "model_host",
        secretLocation: this.secretLocation,
        secretValue: input.huggingFaceToken,
      })
    ).id;
  }

  private async assertNameAvailable(
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (
      (await this.accounts.list()).some(
        (account) => account.name === name && account.id !== exceptId,
      )
    )
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_NAME_TAKEN",
        "A cloud account with this name already exists.",
        409,
      );
  }
}
