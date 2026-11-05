import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { appDataPath, objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import { AppSpaceError } from "./AppSpaceError";

type Env = Record<string, string | undefined>;
export type Run = (command: string, args: string[], env: Env) => Promise<void>;

const RESTORE_TIMEOUT_MS = 5 * 60 * 1000;

export const runFile: Run = async (command, args, env) => {
  await promisify(execFile)(command, args, { env, timeout: RESTORE_TIMEOUT_MS });
};

export interface CopiedDatabase {
  bytes: number;
  copiedAt: Date;
}

/**
 * Restores the live app's database from its replica into a single file and
 * stores it at `key`. The app keeps running: the copy is as of its last sync.
 */
export class AppDataCopier {
  constructor(
    private readonly env: () => Env = () => process.env,
    private readonly run: Run = runFile,
  ) {}

  async copy(projectId: string, key: string): Promise<CopiedDatabase> {
    const dir = await mkdtemp(join(tmpdir(), "viberglass-app-data-"));
    try {
      const config = join(dir, "litestream.yml");
      const output = join(dir, "copy.db");
      const copiedAt = new Date();
      await writeFile(config, litestreamConfig(this.env(), join(dir, "app.db"), appDataPath(projectId)), { mode: 0o600 });
      await this.run(
        "litestream",
        ["restore", "-config", config, "-no-expand-env", "-if-replica-exists", "-o", output, join(dir, "app.db")],
        restoreEnv(this.env()),
      );
      const bytes = await sizeOf(output);
      if (bytes === null) throw new AppSpaceError("NO_DATA", "The app has no data yet.");
      await this.upload(output, key, bytes);
      return { bytes, copiedAt };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async remove(key: string): Promise<void> {
    const env = this.env();
    const client = new S3Client(objectStorageClientConfig(env));
    try {
      await client.send(new DeleteObjectCommand({ Bucket: objectStorageBucket(env), Key: key }));
    } finally {
      client.destroy();
    }
  }

  private async upload(path: string, key: string, bytes: number): Promise<void> {
    const env = this.env();
    const client = new S3Client(objectStorageClientConfig(env));
    try {
      await client.send(new PutObjectCommand({
        Bucket: objectStorageBucket(env),
        Key: key,
        Body: createReadStream(path),
        ContentLength: bytes,
        ContentType: "application/vnd.sqlite3",
      }));
    } finally {
      client.destroy();
    }
  }
}

export function litestreamConfig(env: Env, databasePath: string, replicaPath: string): string {
  const bucket = objectStorageBucket(env);
  if (!bucket) throw new Error("Object storage is not configured");
  const { region, endpoint, forcePathStyle } = objectStorageClientConfig(env);
  return [
    "dbs:",
    `  - path: ${JSON.stringify(databasePath)}`,
    "    replica:",
    "      type: s3",
    `      bucket: ${JSON.stringify(bucket)}`,
    `      path: ${JSON.stringify(replicaPath)}`,
    `      region: ${JSON.stringify(region)}`,
    ...(endpoint ? [`      endpoint: ${JSON.stringify(endpoint)}`] : []),
    ...(forcePathStyle ? ["      force-path-style: true"] : []),
    "",
  ].join("\n");
}

/** Litestream reads the AWS names; the platform's own keys, when it has them, go by S3_ ones. */
export function restoreEnv(env: Env): Env {
  const { PATH, HOME, AWS_REGION, AWS_CONTAINER_CREDENTIALS_RELATIVE_URI, AWS_CONTAINER_CREDENTIALS_FULL_URI, AWS_CONTAINER_AUTHORIZATION_TOKEN, AWS_WEB_IDENTITY_TOKEN_FILE, AWS_ROLE_ARN, AWS_PROFILE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = env;
  const inherited = { PATH, HOME, AWS_REGION, AWS_CONTAINER_CREDENTIALS_RELATIVE_URI, AWS_CONTAINER_CREDENTIALS_FULL_URI, AWS_CONTAINER_AUTHORIZATION_TOKEN, AWS_WEB_IDENTITY_TOKEN_FILE, AWS_ROLE_ARN, AWS_PROFILE };
  const keys = env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
    ? { AWS_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN: env.S3_SESSION_TOKEN }
    : { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN };
  return Object.fromEntries(Object.entries({ ...inherited, ...keys }).filter(([, value]) => value !== undefined));
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}
