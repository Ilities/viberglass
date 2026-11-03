import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { appDataPath, objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";

type Env = Record<string, string | undefined>;

// MinIO accepts any role; AWS needs a real one the platform's credentials may assume.
const PLACEHOLDER_ROLE_ARN = "arn:aws:iam::000000000000:role/viberglass-app-data";
// MinIO's longest; AWS caps role sessions far lower, so set APPS_DATA_CREDENTIAL_SECONDS there.
const DEFAULT_SECONDS = 365 * 24 * 60 * 60;

/** Session credentials an app's Litestream writes its replica with, as the runtime image reads them. */
export interface AppDataCredentials {
  forApp(projectId: string): Promise<Record<string, string>>;
}

/**
 * Credentials from STS AssumeRole with a session policy that only reaches the
 * app's own replica, so an app can't read another app's data or its own backups.
 */
export class StsAppDataCredentials implements AppDataCredentials {
  constructor(private readonly env: () => Env = () => process.env) {}

  async forApp(projectId: string): Promise<Record<string, string>> {
    const env = this.env();
    const client = new STSClient(objectStorageClientConfig(env));
    try {
      const { Credentials: credentials } = await client.send(new AssumeRoleCommand({
        RoleArn: env.APPS_DATA_ROLE_ARN?.trim() || PLACEHOLDER_ROLE_ARN,
        RoleSessionName: `app-${projectId}`.slice(0, 64),
        DurationSeconds: Number(env.APPS_DATA_CREDENTIAL_SECONDS) || DEFAULT_SECONDS,
        Policy: JSON.stringify(replicaPolicy(objectStorageBucket(env), appDataPath(projectId))),
      }));
      if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
        throw new Error("Object storage issued no credentials for the app's data");
      }
      return {
        AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
        AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
        AWS_SESSION_TOKEN: credentials.SessionToken,
      };
    } finally {
      client.destroy();
    }
  }
}

export function replicaPolicy(bucket: string, path: string): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        Resource: [`arn:aws:s3:::${bucket}/${path}/*`],
      },
      {
        Effect: "Allow",
        Action: ["s3:ListBucket"],
        Resource: [`arn:aws:s3:::${bucket}`],
        Condition: { StringLike: { "s3:prefix": [`${path}/*`, path] } },
      },
    ],
  };
}
