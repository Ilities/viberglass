import { AssumeRoleCommand, STSClient } from "@aws-sdk/client-sts";
import { appDataPath, objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import { appDataCredentialSeconds } from "./appHostingConfig";

type Env = Record<string, string | undefined>;

// MinIO accepts any role; AWS needs a real one the platform's credentials may assume.
const PLACEHOLDER_ROLE_ARN = "arn:aws:iam::000000000000:role/viberglass-app-data";
const PREVIEW_SECONDS = 60 * 60;

/** Session credentials as the runtime image reads them, and when they stop working. */
export interface IssuedCredentials {
  env: Record<string, string>;
  expiresAt: Date;
}

/** Session credentials for an app's replica. */
export interface AppDataCredentials {
  /** For the live app's Litestream, which writes the replica. */
  forApp(projectId: string): Promise<IssuedCredentials>;
  /** For a preview, which only restores from it. */
  forPreview(projectId: string): Promise<IssuedCredentials>;
}

/**
 * Credentials from STS AssumeRole with a session policy that only reaches the
 * app's own replica, so an app can't read another app's data or its own backups.
 */
export class StsAppDataCredentials implements AppDataCredentials {
  constructor(private readonly env: () => Env = () => process.env) {}

  forApp(projectId: string): Promise<IssuedCredentials> {
    return this.assume(`app-${projectId}`, (bucket) => replicaPolicy(bucket, appDataPath(projectId)), appDataCredentialSeconds(this.env()));
  }

  forPreview(projectId: string): Promise<IssuedCredentials> {
    // Only the restore at its start reads the replica.
    return this.assume(`preview-${projectId}`, (bucket) => replicaPolicy(bucket, appDataPath(projectId), { readOnly: true }), PREVIEW_SECONDS);
  }

  private async assume(sessionName: string, policy: (bucket: string) => Record<string, unknown>, seconds: number): Promise<IssuedCredentials> {
    const env = this.env();
    const client = new STSClient(objectStorageClientConfig(env));
    try {
      const { Credentials: credentials } = await client.send(new AssumeRoleCommand({
        RoleArn: env.APPS_DATA_ROLE_ARN?.trim() || PLACEHOLDER_ROLE_ARN,
        RoleSessionName: sessionName.slice(0, 64),
        DurationSeconds: seconds,
        Policy: JSON.stringify(policy(objectStorageBucket(env))),
      }));
      if (!credentials?.AccessKeyId || !credentials.SecretAccessKey || !credentials.SessionToken) {
        throw new Error("Object storage issued no credentials for the app's data");
      }
      return {
        env: {
          AWS_ACCESS_KEY_ID: credentials.AccessKeyId,
          AWS_SECRET_ACCESS_KEY: credentials.SecretAccessKey,
          AWS_SESSION_TOKEN: credentials.SessionToken,
        },
        expiresAt: credentials.Expiration ?? new Date(Date.now() + seconds * 1000),
      };
    } finally {
      client.destroy();
    }
  }
}

export function replicaPolicy(bucket: string, path: string, options: { readOnly?: boolean } = {}): Record<string, unknown> {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: options.readOnly ? ["s3:GetObject"] : ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
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
