import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";
import type { WorkerObjectStorage } from "./workerObjectStorage";

/** Object storage reached with the worker's own credentials, as ECS and Lambda workers do. */
export class S3WorkerStorage implements WorkerObjectStorage {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  async download(storageUrl: string): Promise<Buffer> {
    const match = storageUrl.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error(`Invalid S3 URL: ${storageUrl}`);
    const client = new S3Client(objectStorageClientConfig(this.env));
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: match[1], Key: match[2] }));
      if (!response.Body) throw new Error(`Empty object at ${storageUrl}`);
      return Buffer.from(await response.Body.transformToByteArray());
    } finally {
      client.destroy();
    }
  }

  async upload(archive: Buffer, sessionId: string): Promise<string> {
    const bucket = objectStorageBucket(this.env);
    if (!bucket) throw new Error("S3_BUCKET / AWS_S3_BUCKET is not set, so conversation state cannot be stored");
    const key = `conversation-state/${sessionId}/${Date.now()}.tar.gz`;
    const client = new S3Client(objectStorageClientConfig(this.env));
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: archive, ContentType: "application/gzip" }));
    } finally {
      client.destroy();
    }
    return `s3://${bucket}/${key}`;
  }
}
