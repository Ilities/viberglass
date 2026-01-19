import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";
/**
 * S3 storage configuration options.
 */
export interface StorageOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Prefix for bucket name (default: "viberator-uploads") */
  bucketPrefix?: string;
  /** Enable versioning (default: false for dev, true for prod/staging) */
  versioningEnabled?: boolean;
}
/**
 * S3 lifecycle rule configuration.
 */
export interface LifecycleRule {
  /** Rule identifier */
  id: string;
  /** Abort incomplete multipart uploads after days */
  abortIncompleteMultipartUploadDays?: number;
  /** Delete noncurrent versions after days */
  noncurrentVersionExpirationDays?: number;
  /** Transition noncurrent versions to IA after days */
  noncurrentVersionTransitionToIaDays?: number;
  /** Expire current objects after days */
  expirationDays?: number;
  /** Transition current objects to IA after days */
  transitionToIaDays?: number;
  /** Transition current objects to Glacier after days */
  transitionToGlacierDays?: number;
  /** Transition current objects to Deep Archive after days */
  transitionToDeepArchiveDays?: number;
}
/**
 * S3 storage component outputs.
 */
export interface StorageOutputs {
  /** Bucket name for application configuration */
  bucketName: pulumi.Output<string>;
  /** Bucket ARN for IAM policies */
  bucketArn: pulumi.Output<string>;
  /** Bucket ID */
  bucketId: pulumi.Output<string>;
  /** IAM policy ARN for S3 access */
  accessPolicyArn: pulumi.Output<string>;
}
/**
 * Creates an S3 bucket for file uploads with encryption and lifecycle policies.
 *
 * This creates:
 * - S3 bucket with server-side encryption (AES256)
 * - Block public access configuration
 * - Versioning (optional based on environment)
 * - Lifecycle rules for cost optimization
 * - IAM policy for bucket access
 *
 * The bucket is designed for storing:
 * - Ticket attachments
 * - Agent artifacts (logs, patches, screenshots)
 * - User-uploaded files
 */
export declare function createStorage(options: StorageOptions): StorageOutputs;
