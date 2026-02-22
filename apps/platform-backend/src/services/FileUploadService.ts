import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import type { MediaAsset } from "@viberglass/types";
import { createChildLogger } from "../config/logger";
import { buildMediaContentUrl } from "./ticket-media/publicApiUrl";
import {
  buildContainerPath,
  buildDiskPath,
  buildS3Key,
  type TicketMediaKind,
} from "./ticket-media/mediaStoragePaths";
import { parseMediaLocation } from "./ticket-media/mediaLocation";

const logger = createChildLogger({ service: "FileUploadService" });

const region = process.env.AWS_REGION || "eu-west-1";
const bucketName = process.env.AWS_S3_BUCKET?.trim() || "viberglass-media";
const hasS3Bucket = bucketName.length > 0;

function createS3Client(): S3Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";

  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region,
    });
  }

  return new S3Client({ region });
}

const s3 = createS3Client();

// Configure multer for memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images and videos are allowed."));
    }
  },
});

async function ensureDirectory(filePath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
}

function toS3StorageUrl(key: string, bucket = bucketName): string {
  return `s3://${bucket}/${key}`;
}

function toFileStorageUrl(filePath: string): string {
  return `file://${filePath}`;
}

export class FileUploadService {
  async uploadScreenshot(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, "screenshot");
  }

  async uploadRecording(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, "recording");
  }

  async uploadFile(
    file: Express.Multer.File,
    kind: TicketMediaKind,
  ): Promise<MediaAsset> {
    const mediaId = uuidv4();
    const uploadedAt = new Date().toISOString();
    const diskPath = buildDiskPath(kind, mediaId, file.originalname);

    await ensureDirectory(diskPath);
    await fs.promises.writeFile(diskPath, file.buffer);

    let storageUrl = toFileStorageUrl(diskPath);

    if (hasS3Bucket) {
      const s3Key = buildS3Key(kind, mediaId, file.originalname);
      try {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            Metadata: {
              originalName: file.originalname,
              uploadedAt,
            },
          }),
        );
        storageUrl = toS3StorageUrl(s3Key);
      } catch (error) {
        logger.warn("Failed to upload ticket media to S3; keeping disk copy", {
          mediaId,
          bucketName,
          s3Key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      id: mediaId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: storageUrl,
      storageUrl,
      uploadedAt,
    };
  }

  async generateSignedUrlFromStorageUrl(
    storageUrl: string,
    expiresIn = 3600,
  ): Promise<string> {
    const location = parseMediaLocation(storageUrl);

    if (location.type === "s3") {
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: location.bucket,
          Key: location.key,
        }),
        { expiresIn },
      );
    }

    if (location.type === "file") {
      return storageUrl;
    }

    return location.url;
  }

  async deleteFileByStorageUrl(storageUrl: string): Promise<void> {
    const location = parseMediaLocation(storageUrl);

    if (location.type === "s3") {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: location.bucket,
          Key: location.key,
        }),
      );
      return;
    }

    if (location.type === "file") {
      await fs.promises.unlink(location.path).catch(() => undefined);
    }
  }

  async ensureLocalPathForMedia(
    media: Pick<MediaAsset, "id" | "filename" | "url" | "storageUrl">,
    kind: TicketMediaKind,
  ): Promise<string | null> {
    const source = media.storageUrl || media.url;
    const location = parseMediaLocation(source);
    const diskPath = buildDiskPath(kind, media.id, media.filename);

    if (location.type === "file") {
      const directExists = await fs.promises
        .access(location.path, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false);
      if (directExists) {
        return location.path;
      }

      const derivedExists = await fs.promises
        .access(diskPath, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false);
      return derivedExists ? diskPath : null;
    }

    if (location.type !== "s3") {
      return null;
    }

    try {
      await ensureDirectory(diskPath);
      const object = await s3.send(
        new GetObjectCommand({
          Bucket: location.bucket,
          Key: location.key,
        }),
      );

      if (!object.Body) {
        return null;
      }

      const bytes = await object.Body.transformToByteArray();
      await fs.promises.writeFile(diskPath, Buffer.from(bytes));
      return diskPath;
    } catch (error) {
      logger.warn("Failed to materialize S3 media locally", {
        mediaId: media.id,
        source,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async ensureS3UrlForMedia(
    media: Pick<
      MediaAsset,
      "id" | "filename" | "mimeType" | "url" | "storageUrl"
    >,
    kind: TicketMediaKind,
  ): Promise<string | null> {
    const source = media.storageUrl || media.url;
    const location = parseMediaLocation(source);

    if (location.type === "s3") {
      return toS3StorageUrl(location.key, location.bucket);
    }

    if (!hasS3Bucket) {
      return null;
    }

    if (location.type !== "file") {
      return null;
    }

    const filePath = await fs.promises
      .access(location.path, fs.constants.R_OK)
      .then(() => location.path)
      .catch(() => buildDiskPath(kind, media.id, media.filename));

    const body = await fs.promises.readFile(filePath);
    const key = buildS3Key(kind, media.id, media.filename);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: media.mimeType,
      }),
    );

    return toS3StorageUrl(key);
  }

  getContainerMountPath(
    mediaId: string,
    filename: string,
    kind: TicketMediaKind,
  ): string {
    return buildContainerPath(kind, mediaId, filename);
  }

  getMediaContentUrl(mediaId: string): string {
    return buildMediaContentUrl(mediaId);
  }
}
