import { promises as fs } from "fs";
import path from "path";
import { GetObjectCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";
import { objectFile } from "../bundle/bundleManifest";
import type { ObjectReferences } from "./objectReferences";

export interface ExportedObjects {
  keys: string[];
  contentTypes: Record<string, string>;
  /** Keys a row names that the bucket doesn't have. */
  missing: string[];
}

const isMissing = (error: unknown): boolean =>
  error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound");

export function bundlePath(directory: string, relative: string): string {
  if (relative.split("/").some((segment) => segment === ".." || segment === "")) {
    throw new Error(`Refusing the object key ${relative}`);
  }
  return path.join(directory, ...relative.split("/"));
}

/** Copies the objects an export needs from the source bucket into the bundle directory. */
export class ObjectExporter {
  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket: string,
    private readonly directory: string,
  ) {}

  async export(references: ObjectReferences): Promise<ExportedObjects> {
    const keys = new Set<string>();
    const contentTypes: Record<string, string> = {};
    const missing: string[] = [];
    const wanted = new Set(references.keys);
    for (const prefix of references.prefixes) {
      for (const key of await this.list(prefix)) wanted.add(key);
    }
    for (const key of [...wanted].sort()) {
      const copied = await this.copy(key);
      if (!copied) {
        missing.push(key);
        continue;
      }
      keys.add(key);
      if (copied.contentType) contentTypes[key] = copied.contentType;
    }
    return { keys: [...keys], contentTypes, missing };
  }

  private async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let ContinuationToken: string | undefined;
    do {
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }));
      for (const object of page.Contents ?? []) if (object.Key && !object.Key.endsWith("/")) keys.push(object.Key);
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
    return keys;
  }

  private async copy(key: string): Promise<{ contentType: string | undefined } | null> {
    try {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!object.Body) return null;
      const target = bundlePath(this.directory, objectFile(key));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await object.Body.transformToByteArray());
      return { contentType: object.ContentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
}
