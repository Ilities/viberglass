import type {
  ModelDeploymentInput,
  ModelDeploymentMode,
  ModelDeploymentStatus,
  ModelDeploymentView,
  ModelHostFlavour,
} from "@viberglass/types";
import type {
  ModelDeploymentDAO,
  ModelDeploymentRecord,
} from "../../persistence/modelHosting/ModelDeploymentDAO";
import type { ModelEndpointDAO } from "../../persistence/modelEndpoint/ModelEndpointDAO";
import type { ModelHostConnection, ModelHostConnector } from "./ModelHostConnector";
import { ModelHostingError } from "../errors/ModelHostingError";
import logger from "../../config/logger";

function stripRecord({ externalId: _externalId, ...deployment }: ModelDeploymentRecord) {
  return deployment;
}

/** The cloud's refusals (quota, balance, a bad flavour) reach the admin in its own words. */
async function cloud<T>(action: Promise<T>): Promise<T> {
  try {
    return await action;
  } catch (error) {
    if (error instanceof ModelHostingError) throw error;
    throw new ModelHostingError(
      "MODEL_HOST_FAILED",
      error instanceof Error ? error.message : String(error),
      502,
    );
  }
}

/** GPU deployments in customers' cloud accounts, each owning the model endpoint runners pick. */
export class ModelDeploymentService {
  constructor(
    private readonly deployments: ModelDeploymentDAO,
    private readonly endpoints: Pick<ModelEndpointDAO, "list" | "runnersUsing">,
    private readonly connector: Pick<ModelHostConnector, "connect">,
  ) {}

  async list(): Promise<ModelDeploymentView[]> {
    const deployments = await this.deployments.list();
    const accounts = new Map<string, Promise<{ connection: ModelHostConnection; flavours: ModelHostFlavour[] } | null>>();
    for (const { accountId } of deployments) {
      if (!accounts.has(accountId)) accounts.set(accountId, this.connectWithFlavours(accountId));
    }
    return Promise.all(
      deployments.map(async (deployment) => {
        const account = await accounts.get(deployment.accountId);
        const flavour = account?.flavours.find(
          (candidate) =>
            candidate.id === deployment.flavour.id &&
            candidate.gpuCount === deployment.flavour.gpuCount,
        );
        return {
          ...stripRecord(deployment),
          status: account ? await this.status(account.connection, deployment) : { state: "unknown" as const },
          pricePerHour: flavour?.pricePerHour ?? null,
          currency: flavour?.currency ?? null,
          runners: (await this.endpoints.runnersUsing(deployment.endpointId)).map((runner) => runner.name),
        };
      }),
    );
  }

  async flavours(accountId: string): Promise<ModelHostFlavour[]> {
    const { host, credentials } = await this.connector.connect(accountId);
    return cloud(host.listFlavours(credentials));
  }

  async create(input: ModelDeploymentInput): Promise<ModelDeploymentRecord> {
    const { account, host, credentials } = await this.connector.connect(input.accountId);
    await this.assertNameAvailable(input.name);
    const created = await cloud(
      host.create(credentials, {
        name: input.name,
        model: input.model,
        flavour: input.flavour,
        servingArgs: input.servingArgs,
        mode: "scale-to-zero",
      }),
    );
    try {
      return await this.deployments.create(
        { ...input, externalId: created.externalId, mode: "scale-to-zero" },
        {
          name: input.name,
          baseUrl: created.baseUrl,
          apiFormat: "openai-chat",
          auth: { scheme: "bearer" },
          secretId: account.endpointKeySecretId,
          extraHeaders: {},
          models: [input.model],
          mayColdStart: true,
        },
      );
    } catch (error) {
      await host.delete(credentials, created.externalId).catch((cleanupError: unknown) =>
        logger.error("Couldn't remove a deployment that failed to save", {
          externalId: created.externalId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        }),
      );
      throw error;
    }
  }

  async setMode(id: string, mode: ModelDeploymentMode): Promise<void> {
    const deployment = await this.require(id);
    const { host, credentials } = await this.connector.connect(deployment.accountId);
    await cloud(host.setMode(credentials, deployment.externalId, mode));
    await this.deployments.setMode(id, mode);
  }

  async delete(id: string): Promise<void> {
    const deployment = await this.require(id);
    const runners = await this.endpoints.runnersUsing(deployment.endpointId);
    if (runners.length)
      throw new ModelHostingError(
        "MODEL_DEPLOYMENT_IN_USE",
        `Move these runners to another model first: ${runners.map((runner) => runner.name).join(", ")}.`,
        409,
      );
    const { host, credentials } = await this.connector.connect(deployment.accountId);
    await cloud(host.delete(credentials, deployment.externalId));
    await this.deployments.delete(id);
  }

  async require(id: string): Promise<ModelDeploymentRecord> {
    const deployment = await this.deployments.get(id);
    if (!deployment)
      throw new ModelHostingError("MODEL_DEPLOYMENT_NOT_FOUND", "Model deployment not found", 404);
    return deployment;
  }

  private async status(
    { host, credentials }: ModelHostConnection,
    deployment: ModelDeploymentRecord,
  ): Promise<ModelDeploymentStatus> {
    try {
      return await host.getStatus(credentials, deployment.externalId);
    } catch (error) {
      return { state: "unknown", detail: error instanceof Error ? error.message : String(error) };
    }
  }

  private async connectWithFlavours(accountId: string) {
    try {
      const connection = await this.connector.connect(accountId);
      const flavours = await connection.host.listFlavours(connection.credentials).catch(() => []);
      return { connection, flavours };
    } catch {
      return null;
    }
  }

  private async assertNameAvailable(name: string): Promise<void> {
    // The deployment's endpoint takes its name, so endpoint names count too.
    if ((await this.endpoints.list()).some((endpoint) => endpoint.name === name))
      throw new ModelHostingError(
        "MODEL_DEPLOYMENT_NAME_TAKEN",
        "A model endpoint or deployment with this name already exists.",
        409,
      );
  }
}
