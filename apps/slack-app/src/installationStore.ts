import { Installation, InstallationQuery } from "@slack/bolt";
import { promises as fs } from "fs";
import path from "path";

type InstallationRecord = Record<string, Installation>;

interface InstallationStoreOptions {
  storePath: string;
}

interface DynamoInstallationStoreOptions {
  tableName: string;
}

interface DynamoInstallationRecord {
  installationId: string;
  installation: Installation;
}

type DynamoDocumentClient = {
  get: (params: {
    TableName: string;
    Key: { installationId: string };
  }) => { promise: () => Promise<{ Item?: DynamoInstallationRecord }> };
  put: (params: {
    TableName: string;
    Item: DynamoInstallationRecord;
  }) => { promise: () => Promise<void> };
};

function getKeyFromInstallation(installation: Installation): string {
  if (installation.isEnterpriseInstall && installation.enterprise?.id) {
    return `enterprise:${installation.enterprise.id}`;
  }
  if (installation.team?.id) {
    return `team:${installation.team.id}`;
  }
  if (installation.enterprise?.id) {
    return `enterprise:${installation.enterprise.id}`;
  }

  throw new Error("Installation is missing a team or enterprise id");
}

function getKeyFromQuery(query: InstallationQuery): string {
  if (query.isEnterpriseInstall && query.enterpriseId) {
    return `enterprise:${query.enterpriseId}`;
  }
  if (query.teamId) {
    return `team:${query.teamId}`;
  }
  if (query.enterpriseId) {
    return `enterprise:${query.enterpriseId}`;
  }

  throw new Error("Installation query is missing a team or enterprise id");
}

function createDynamoClient(): DynamoDocumentClient {
  // Use the AWS SDK provided by the Lambda runtime when available.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const awsSdk = require("aws-sdk") as {
    DynamoDB: { DocumentClient: new () => DynamoDocumentClient };
  };
  return new awsSdk.DynamoDB.DocumentClient();
}

async function ensureStoreFile(storePath: string): Promise<void> {
  const storeDir = path.dirname(storePath);
  await fs.mkdir(storeDir, { recursive: true });

  try {
    await fs.access(storePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await fs.writeFile(storePath, "{}\n", "utf8");
        return;
      }
    }
    throw error;
  }
}

async function readStore(storePath: string): Promise<InstallationRecord> {
  await ensureStoreFile(storePath);

  const raw = await fs.readFile(storePath, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  return JSON.parse(trimmed) as InstallationRecord;
}

async function writeStore(
  storePath: string,
  data: InstallationRecord,
): Promise<void> {
  await ensureStoreFile(storePath);
  await fs.writeFile(storePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function createFileInstallationStore(options: InstallationStoreOptions) {
  const { storePath } = options;

  return {
    storeInstallation: async (installation: Installation) => {
      const key = getKeyFromInstallation(installation);
      const current = await readStore(storePath);
      current[key] = installation;
      await writeStore(storePath, current);
    },
    fetchInstallation: async (query: InstallationQuery) => {
      const key = getKeyFromQuery(query);
      const current = await readStore(storePath);
      const installation = current[key];
      if (!installation) {
        throw new Error(`No installation found for ${key}`);
      }
      return installation;
    },
  };
}

export function createDynamoInstallationStore(
  options: DynamoInstallationStoreOptions,
) {
  const { tableName } = options;
  const client = createDynamoClient();

  return {
    storeInstallation: async (installation: Installation) => {
      const installationId = getKeyFromInstallation(installation);
      await client
        .put({
          TableName: tableName,
          Item: {
            installationId,
            installation,
          },
        })
        .promise();
    },
    fetchInstallation: async (query: InstallationQuery) => {
      const installationId = getKeyFromQuery(query);
      const response = await client
        .get({
          TableName: tableName,
          Key: {
            installationId,
          },
        })
        .promise();
      const installation = response.Item?.installation;
      if (!installation) {
        throw new Error(`No installation found for ${installationId}`);
      }
      return installation;
    },
  };
}
