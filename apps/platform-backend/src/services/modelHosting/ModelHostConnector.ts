import type { ModelHost, ModelHostCredentials } from "@viberglass/types";
import type { ModelHostAccountRecord } from "../../persistence/modelHosting/ModelHostAccountDAO";
import type { SecretService } from "../SecretService";
import type { ModelHostAccountService } from "./ModelHostAccountService";
import type { ModelHostRegistry } from "./ModelHostRegistry";
import { ModelHostingError } from "../errors/ModelHostingError";

export interface ModelHostConnection {
  account: ModelHostAccountRecord;
  host: ModelHost;
  credentials: ModelHostCredentials;
}

/** An account's cloud adapter with the account's credentials resolved. */
export class ModelHostConnector {
  constructor(
    private readonly accounts: Pick<ModelHostAccountService, "require">,
    private readonly hosts: Pick<ModelHostRegistry, "require">,
    private readonly secrets: Pick<SecretService, "resolveSecretValues">,
  ) {}

  async connect(accountId: string): Promise<ModelHostConnection> {
    const account = await this.accounts.require(accountId);
    const ids = [account.clientSecretId, account.huggingFaceTokenSecretId];
    const values = await this.secrets.resolveSecretValues(
      ids.filter((id): id is string => id !== null),
    );
    const clientSecret = values.get(account.clientSecretId);
    if (!clientSecret)
      throw new ModelHostingError(
        "MODEL_HOST_ACCOUNT_INVALID",
        `The client secret of ${account.name} can't be read. Enter it again.`,
      );
    const huggingFaceToken = account.huggingFaceTokenSecretId
      ? values.get(account.huggingFaceTokenSecretId)
      : undefined;
    return {
      account,
      host: this.hosts.require(account.host),
      credentials: {
        clientId: account.clientId,
        clientSecret,
        ...(huggingFaceToken ? { huggingFaceToken } : {}),
      },
    };
  }
}
