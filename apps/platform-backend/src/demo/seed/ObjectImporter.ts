import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { objectFile } from "../bundle/bundleManifest";
import type { BundleSource } from "./BundleSource";

const PARALLEL_UPLOADS = 8;

/** Puts the bundle's objects into the instance's bucket under their original keys. */
export class ObjectImporter {
  constructor(
    private readonly source: BundleSource,
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket: string,
  ) {}

  async import(keys: readonly string[], contentTypes: Readonly<Record<string, string>>): Promise<void> {
    let next = 0;
    const worker = async () => {
      while (next < keys.length) {
        const key = keys[next++];
        const body = await this.source.read(objectFile(key));
        await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentTypes[key] }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, keys.length) }, worker));
  }
}
