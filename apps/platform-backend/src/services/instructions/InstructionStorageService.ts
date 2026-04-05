import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { createChildLogger } from "../../config/logger";
import { normalizeInstructionPath } from "./pathPolicy";

const logger = createChildLogger({ service: "InstructionStorageService" });

export type InstructionStrategyType = "docker" | "ecs" | "lambda";

interface ParsedS3Url {
  bucket: string;
  key: string;
}

export interface InlineInstructionFile {
  fileType: string;
  content: string;
}

export class InstructionStorageService {
  private readonly s3Client: S3Client;
  private readonly region: string;
  private readonly bucketName: string;
  private readonly fsRoot: string;

  constructor() {
    this.region = process.env.AWS_REGION || "eu-west-1";
    this.bucketName =
      process.env.INSTRUCTION_FILES_S3_BUCKET?.trim() ||
      process.env.AWS_S3_BUCKET?.trim() ||
      "";
    this.fsRoot =
      process.env.CLANKER_INSTRUCTION_FILES_ROOT ||
      path.resolve(process.cwd(), ".clanker-instructions");

    this.s3Client = new S3Client({
      region: this.region,
    });
  }

  async storeClankerInstruction(
    clankerId: string,
    fileType: string,
    content: string,
    strategyType: InstructionStrategyType,
  ): Promise<string> {
    const normalizedPath = normalizeInstructionPath(fileType);
    if (strategyType === "docker") {
      return this.storeToFilesystem(clankerId, normalizedPath, content);
    }

    return this.storeToS3(
      `clankers/${clankerId}/instructions/${normalizedPath}`,
      content,
    );
  }

  async uploadJobInstructionFiles(
    clankerId: string,
    jobId: string,
    files: InlineInstructionFile[],
  ): Promise<Array<{ fileType: string; s3Url: string }>> {
    if (files.length === 0) {
      return [];
    }

    this.ensureS3Configured();

    const uploaded: Array<{ fileType: string; s3Url: string }> = [];
    for (const file of files) {
      const normalizedPath = normalizeInstructionPath(file.fileType);
      const s3Url = await this.storeToS3(
        `jobs/${jobId}/clankers/${clankerId}/instructions/${normalizedPath}`,
        file.content,
      );
      uploaded.push({
        fileType: normalizedPath,
        s3Url,
      });
    }

    return uploaded;
  }

  async readInstruction(storageUrl: string): Promise<string> {
    if (storageUrl.startsWith("s3://")) {
      const parsed = this.parseS3Url(storageUrl);
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: parsed.bucket,
          Key: parsed.key,
        }),
      );

      if (!response.Body) {
        throw new Error(`Instruction storage object is empty: ${storageUrl}`);
      }

      return response.Body.transformToString();
    }

    if (storageUrl.startsWith("file://")) {
      const filePath = decodeURIComponent(storageUrl.slice("file://".length));
      return fs.promises.readFile(filePath, "utf-8");
    }

    throw new Error(`Unsupported instruction storage URL: ${storageUrl}`);
  }

  async deleteInstruction(storageUrl: string): Promise<void> {
    if (!storageUrl) {
      return;
    }

    try {
      if (storageUrl.startsWith("s3://")) {
        const parsed = this.parseS3Url(storageUrl);
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: parsed.bucket,
            Key: parsed.key,
          }),
        );
        return;
      }

      if (storageUrl.startsWith("file://")) {
        const filePath = decodeURIComponent(storageUrl.slice("file://".length));
        await fs.promises.unlink(filePath).catch(() => undefined);
      }
    } catch (error) {
      logger.warn("Failed to delete instruction storage object", {
        storageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async storeToFilesystem(
    clankerId: string,
    normalizedPath: string,
    content: string,
  ): Promise<string> {
    const clankerRoot = path.join(this.fsRoot, clankerId);
    const targetPath = path.resolve(clankerRoot, normalizedPath);

    if (!targetPath.startsWith(`${path.resolve(clankerRoot)}${path.sep}`)) {
      throw new Error(`Unsafe instruction file path: ${normalizedPath}`);
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, content, "utf-8");

    return `file://${targetPath}`;
  }

  private async storeToS3(key: string, content: string): Promise<string> {
    const bucket = this.ensureS3Configured();
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: "text/markdown; charset=utf-8",
      }),
    );

    return `s3://${bucket}/${key}`;
  }

  private ensureS3Configured(): string {
    if (!this.bucketName) {
      throw new Error(
        "Instruction storage requires INSTRUCTION_FILES_S3_BUCKET or AWS_S3_BUCKET",
      );
    }

    return this.bucketName;
  }

  private parseS3Url(url: string): ParsedS3Url {
    const parsed = new URL(url);
    if (parsed.protocol !== "s3:") {
      throw new Error(`Invalid S3 URL: ${url}`);
    }

    const bucket = parsed.hostname;
    const key = parsed.pathname.replace(/^\//, "");

    if (!bucket || !key) {
      throw new Error(`Invalid S3 URL: ${url}`);
    }

    return { bucket, key };
  }
}
