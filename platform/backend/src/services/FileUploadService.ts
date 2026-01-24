import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import type { MediaAsset } from "@viberglass/types";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "FileUploadService" });

// Configure AWS S3
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
  region: process.env.AWS_REGION || "us-east-1",
});

const bucketName = process.env.AWS_S3_BUCKET || "viberglass-media";

// Configure multer for memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
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

export class FileUploadService {
  async uploadFile(
    file: Express.Multer.File,
    prefix: string = "uploads",
  ): Promise<MediaAsset> {
    const fileId = uuidv4();
    const fileExtension = this.getFileExtension(file.originalname);
    const filename = `${fileId}${fileExtension}`;
    const key = `${prefix}/${filename}`;

    const uploadParams = {
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
    };

    try {
      await s3.send(new PutObjectCommand(uploadParams));

      // Construct the S3 URL
      const region = process.env.AWS_REGION || "us-east-1";
      const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

      const mediaAsset: MediaAsset = {
        id: fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url,
        uploadedAt: new Date().toISOString(),
      };

      return mediaAsset;
    } catch (error) {
      logger.error("Error uploading file to S3", {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error("Failed to upload file");
    }
  }

  async uploadScreenshot(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, "screenshots");
  }

  async uploadRecording(file: Express.Multer.File): Promise<MediaAsset> {
    return this.uploadFile(file, "recordings");
  }

  async generateSignedUrl(
    key: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    try {
      return await getSignedUrl(s3, command, { expiresIn });
    } catch (error) {
      logger.error("Error generating signed URL", {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error("Failed to generate signed URL");
    }
  }

  async deleteFile(key: string): Promise<void> {
    const params = {
      Bucket: bucketName,
      Key: key,
    };

    try {
      await s3.send(new DeleteObjectCommand(params));
    } catch (error) {
      logger.error("Error deleting file from S3", {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error("Failed to delete file");
    }
  }

  private getFileExtension(filename: string): string {
    const lastDotIndex = filename.lastIndexOf(".");
    return lastDotIndex > -1 ? filename.substring(lastDotIndex) : "";
  }

  getKeyFromUrl(url: string): string {
    // Extract key from S3 URL
    const urlParts = url.split("/");
    const bucketIndex = urlParts.indexOf(bucketName);
    if (bucketIndex > -1 && bucketIndex < urlParts.length - 1) {
      return urlParts.slice(bucketIndex + 1).join("/");
    }
    throw new Error("Invalid S3 URL");
  }
}
