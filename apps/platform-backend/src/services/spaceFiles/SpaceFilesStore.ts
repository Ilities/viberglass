import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { objectStorageBucket, objectStorageClientConfig, objectStorageWorkerClientConfig } from "@viberglass/types";

/** Where a Files space's archives live; workers only ever get short-lived URLs for single objects. */
export interface SpaceFilesStore {
  bucket(): string;
  /** A presigned URL the worker fetches with GET (read) or PUT (write). */
  sign(operation: "read" | "write", storageUrl: string, expiresInSeconds: number): Promise<string>;
  open(storageUrl: string): Promise<Readable>;
}

export function snapshotStorageUrl(bucket: string, projectId: string, snapshotId: string): string {
  return `s3://${bucket}/spaces/${projectId}/snapshots/${snapshotId}/workspace.tar.gz`;
}

function objectOf(storageUrl: string): { Bucket: string; Key: string } {
  const parsed = new URL(storageUrl);
  if (parsed.protocol !== "s3:") throw new Error(`Not an object storage URL: ${storageUrl}`);
  return { Bucket: parsed.hostname, Key: decodeURIComponent(parsed.pathname.slice(1)) };
}

export class S3SpaceFilesStore implements SpaceFilesStore {
  constructor(private readonly env: () => Record<string, string | undefined> = () => process.env) {}

  bucket(): string {
    return objectStorageBucket(this.env());
  }

  async sign(operation: "read" | "write", storageUrl: string, expiresInSeconds: number): Promise<string> {
    const client = new S3Client(objectStorageWorkerClientConfig(this.env()));
    const object = objectOf(storageUrl);
    try {
      const command =
        operation === "read"
          ? new GetObjectCommand(object)
          : new PutObjectCommand({ ...object, ContentType: "application/gzip" });
      return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    } finally {
      client.destroy();
    }
  }

  async open(storageUrl: string): Promise<Readable> {
    const client = new S3Client(objectStorageClientConfig(this.env()));
    const response = await client.send(new GetObjectCommand(objectOf(storageUrl)));
    const body = response.Body;
    if (!(body instanceof Readable)) {
      client.destroy();
      throw new Error("Object storage returned no readable body");
    }
    body.once("close", () => client.destroy());
    return body;
  }
}
