import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { appBackupPath, appDataPath, objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";

type Env = Record<string, string | undefined>;

export interface CopiedData {
  objects: number;
  bytes: number;
}

/**
 * Data backups are copies of an app's Litestream replica, taken while the app
 * is stopped, so the copy is a consistent point Litestream can restore from.
 */
export class AppDataStore {
  constructor(private readonly env: () => Env = () => process.env) {}

  async backup(projectId: string, backupId: string): Promise<CopiedData> {
    return this.copy(appDataPath(projectId), appBackupPath(projectId, backupId));
  }

  /** Replaces the app's replica with the backup's copy. */
  async restore(projectId: string, backupId: string): Promise<CopiedData> {
    await this.clear(appDataPath(projectId));
    return this.copy(appBackupPath(projectId, backupId), appDataPath(projectId));
  }

  private async copy(fromPath: string, toPath: string): Promise<CopiedData> {
    const Bucket = this.bucket();
    const copied: CopiedData = { objects: 0, bytes: 0 };
    await this.eachPage(fromPath, async (client, objects) => {
      for (const object of objects) {
        if (!object.Key) continue;
        await client.send(new CopyObjectCommand({
          Bucket,
          CopySource: `${Bucket}/${object.Key.split("/").map(encodeURIComponent).join("/")}`,
          Key: `${toPath}${object.Key.slice(fromPath.length)}`,
        }));
        copied.objects++;
        copied.bytes += object.Size ?? 0;
      }
    });
    return copied;
  }

  private async clear(path: string): Promise<void> {
    const Bucket = this.bucket();
    await this.eachPage(path, async (client, objects) => {
      const keys = objects.flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
      if (keys.length > 0) await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }));
    });
  }

  private async eachPage(
    path: string,
    visit: (client: S3Client, objects: Array<{ Key?: string; Size?: number }>) => Promise<void>,
  ): Promise<void> {
    const client = new S3Client(objectStorageClientConfig(this.env()));
    try {
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: this.bucket(), Prefix: `${path}/`, ContinuationToken }));
        await visit(client, page.Contents ?? []);
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
    } finally {
      client.destroy();
    }
  }

  private bucket(): string {
    const bucket = objectStorageBucket(this.env());
    if (!bucket) throw new Error("Object storage is not configured");
    return bucket;
  }
}
