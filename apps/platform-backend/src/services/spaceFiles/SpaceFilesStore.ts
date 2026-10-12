import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { objectStorageBucket, objectStorageClientConfig, objectStorageWorkerClientConfig } from "@viberglass/types";

/** Where a Files space's archives live; workers only ever get short-lived URLs for single objects. */
export interface SpaceFilesStore {
  bucket(): string;
  /** A presigned URL the worker fetches with GET (read) or PUT (write). */
  sign(operation: "read" | "write", storageUrl: string, expiresInSeconds: number): Promise<string>;
  open(storageUrl: string): Promise<Readable>;
  put(storageUrl: string, body: Readable | Buffer, bytes: number, contentType: string): Promise<void>;
  /** Deletes the object, or every object under the URL when it ends with `/`. Missing objects are fine. */
  delete(storageUrl: string): Promise<void>;
}

/** Where an artifact version's files live; each file is its own object under it. */
export function artifactVersionPrefix(bucket: string, projectId: string, artifactId: string, versionId: string): string {
  return `s3://${bucket}/spaces/${projectId}/artifacts/${artifactId}/versions/${versionId}/files/`;
}

/** The object for a file under a prefix; each segment is encoded, so names with `#` or `?` stay names. */
export function objectUrlUnder(prefix: string, path: string): string {
  return prefix + path.split("/").map(encodeURIComponent).join("/");
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

  async put(storageUrl: string, body: Readable | Buffer, bytes: number, contentType: string): Promise<void> {
    const client = new S3Client(objectStorageClientConfig(this.env()));
    try {
      await client.send(new PutObjectCommand({ ...objectOf(storageUrl), Body: body, ContentLength: bytes, ContentType: contentType }));
    } finally {
      client.destroy();
    }
  }

  async delete(storageUrl: string): Promise<void> {
    const client = new S3Client(objectStorageClientConfig(this.env()));
    try {
      const { Bucket, Key } = objectOf(storageUrl);
      if (!Key.endsWith("/")) {
        await client.send(new DeleteObjectCommand({ Bucket, Key }));
        return;
      }
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: Key, ContinuationToken }));
        const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
        if (keys.length > 0) await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }));
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
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
