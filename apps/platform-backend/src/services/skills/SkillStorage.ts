import fs from "fs";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ service: "SkillStorage" });

/**
 * Where skill archives live: S3 when a bucket is configured, else the
 * server's own disk. Workers never read this storage directly; they download
 * skills through the platform, so the same storage serves every kind of compute.
 */
export class SkillStorage {
  private readonly bucket: string;
  private readonly fsRoot: string;
  private readonly s3: S3Client;

  constructor() {
    this.bucket = process.env.SKILL_FILES_S3_BUCKET?.trim() || process.env.AWS_S3_BUCKET?.trim() || "";
    this.fsRoot = process.env.SKILL_FILES_ROOT || path.resolve(process.cwd(), ".viberglass-skills");
    this.s3 = new S3Client({ region: process.env.AWS_REGION || "eu-west-1" });
  }

  /** Each upload gets its own key, so a run already downloading the previous version isn't cut short. */
  async save(skillId: string, version: string, archive: Uint8Array): Promise<string> {
    const key = `skills/${skillId}/${version}.zip`;
    if (this.bucket) {
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: archive, ContentType: "application/zip" }));
      return `s3://${this.bucket}/${key}`;
    }
    const target = path.join(this.fsRoot, key);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, archive);
    return `file://${target}`;
  }

  async read(url: string): Promise<Uint8Array> {
    if (url.startsWith("s3://")) {
      const { bucket, key } = parseS3Url(url);
      const response = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!response.Body) throw new Error(`Skill archive is empty: ${url}`);
      return response.Body.transformToByteArray();
    }
    if (url.startsWith("file://")) {
      return fs.promises.readFile(url.slice("file://".length));
    }
    throw new Error(`Unsupported skill storage URL: ${url}`);
  }

  async delete(url: string): Promise<void> {
    try {
      if (url.startsWith("s3://")) {
        const { bucket, key } = parseS3Url(url);
        await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } else if (url.startsWith("file://")) {
        const file = url.slice("file://".length);
        await fs.promises.unlink(file);
        // The skill's folder goes with its last version.
        await fs.promises.rmdir(path.dirname(file)).catch(() => undefined);
      }
    } catch (error) {
      logger.warn("Failed to delete a skill archive", { url, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

function parseS3Url(url: string): { bucket: string; key: string } {
  const parsed = new URL(url);
  return { bucket: parsed.hostname, key: parsed.pathname.replace(/^\//, "") };
}
