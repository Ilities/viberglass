import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * S3 storage configuration options.
 */
export interface StorageOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Prefix for bucket name (default: "viberglass-uploads") */
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
 * Gets lifecycle rules based on environment.
 *
 * Dev: Aggressive cleanup to save costs
 * Staging: Keep data longer with tiered storage
 * Prod: Long-term retention with Glacier archiving
 */
function getLifecycleRules(environment: string): LifecycleRule[] {
  const commonMultipartCleanup = 7; // 7 days for all environments

  if (environment === "dev") {
    return [
      {
        id: "abort-multipart-uploads",
        abortIncompleteMultipartUploadDays: commonMultipartCleanup,
      },
      {
        id: "delete-noncurrent-versions",
        noncurrentVersionExpirationDays: 7,
      },
      {
        id: "expire-current-objects",
        expirationDays: 90,
      },
    ];
  }

  if (environment === "staging") {
    return [
      {
        id: "abort-multipart-uploads",
        abortIncompleteMultipartUploadDays: commonMultipartCleanup,
      },
      {
        id: "transition-noncurrent-to-ia",
        noncurrentVersionTransitionToIaDays: 30,
      },
      {
        id: "delete-noncurrent-versions",
        noncurrentVersionExpirationDays: 90,
      },
    ];
  }

  // Production: long-term retention with Glacier archiving
  return [
    {
      id: "abort-multipart-uploads",
      abortIncompleteMultipartUploadDays: commonMultipartCleanup,
    },
    {
      id: "transition-current-to-ia",
      transitionToIaDays: 30,
    },
    {
      id: "transition-current-to-glacier",
      transitionToGlacierDays: 90,
    },
    {
      id: "transition-current-to-deep-archive",
      transitionToDeepArchiveDays: 180,
    },
    {
      id: "transition-noncurrent-to-glacier",
      noncurrentVersionTransitionToIaDays: 30,
    },
    {
      id: "delete-noncurrent-versions",
      noncurrentVersionExpirationDays: 365,
    },
  ];
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
export function createStorage(options: StorageOptions): StorageOutputs {
  const bucketPrefix = options.bucketPrefix ?? "viberglass-uploads";
  const versioningEnabled =
    options.versioningEnabled ?? options.config.environment !== "dev";

  const bucketName = pulumi.interpolate`${options.config.environment}-${bucketPrefix}`;

  // Create S3 bucket
  const bucket = new aws.s3.BucketV2(
    `${options.config.environment}-viberglass-uploads-bucket`,
    {
      bucket: bucketName,
      tags: options.config.tags,
    },
    {
      aliases: [
        { name: `${options.config.environment}-viberator-uploads-bucket` },
      ],
    },
  );

  // Enable server-side encryption with AES256
  const encryption = new aws.s3.BucketServerSideEncryptionConfigurationV2(
    `${options.config.environment}-viberglass-uploads-encryption`,
    {
      bucket: bucket.id,
      rules: [
        {
          applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
          },
          bucketKeyEnabled: true,
        },
      ],
    },
  );

  // Block all public access
  const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
    `${options.config.environment}-viberglass-uploads-public-block`,
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
  );

  // Configure versioning
  const versioning = new aws.s3.BucketVersioningV2(
    `${options.config.environment}-viberglass-uploads-versioning`,
    {
      bucket: bucket.id,
      versioningConfiguration: {
        status: versioningEnabled ? "Enabled" : "Suspended",
      },
    },
  );

  // Get lifecycle rules for environment
  const lifecycleRules = getLifecycleRules(options.config.environment);

  // Build lifecycle configuration rules for Pulumi
  const rules: aws.types.input.s3.BucketLifecycleConfigurationV2Rule[] = [];

  for (const rule of lifecycleRules) {
    const lifecycleRule: aws.types.input.s3.BucketLifecycleConfigurationV2Rule =
      {
        id: rule.id,
        status: "Enabled",
        filter: {}, // Apply to all objects in bucket
      };

    // Abort incomplete multipart uploads
    if (rule.abortIncompleteMultipartUploadDays !== undefined) {
      lifecycleRule.abortIncompleteMultipartUpload = {
        daysAfterInitiation: rule.abortIncompleteMultipartUploadDays,
      };
    }

    // Noncurrent version expiration
    if (rule.noncurrentVersionExpirationDays !== undefined) {
      lifecycleRule.noncurrentVersionExpiration = {
        noncurrentDays: rule.noncurrentVersionExpirationDays,
      };
    }

    // Noncurrent version transition to IA
    if (rule.noncurrentVersionTransitionToIaDays !== undefined) {
      lifecycleRule.noncurrentVersionTransitions = [
        {
          storageClass: "STANDARD_IA",
          noncurrentDays: rule.noncurrentVersionTransitionToIaDays,
        },
      ];
    }

    // Current object expiration
    if (rule.expirationDays !== undefined) {
      lifecycleRule.expiration = {
        days: rule.expirationDays,
      };
    }

    // Current object transitions (IA -> Glacier -> Deep Archive)
    const transitions: aws.types.input.s3.BucketLifecycleConfigurationV2RuleTransition[] =
      [];
    if (rule.transitionToIaDays !== undefined) {
      transitions.push({
        storageClass: "STANDARD_IA",
        days: rule.transitionToIaDays,
      });
    }
    if (rule.transitionToGlacierDays !== undefined) {
      transitions.push({
        storageClass: "GLACIER",
        days: rule.transitionToGlacierDays,
      });
    }
    if (rule.transitionToDeepArchiveDays !== undefined) {
      transitions.push({
        storageClass: "DEEP_ARCHIVE",
        days: rule.transitionToDeepArchiveDays,
      });
    }
    if (transitions.length > 0) {
      lifecycleRule.transitions = transitions;
    }

    rules.push(lifecycleRule);
  }

  // Create lifecycle configuration (only if we have rules)
  let lifecycleConfiguration: aws.s3.BucketLifecycleConfigurationV2 | undefined;
  if (rules.length > 0) {
    lifecycleConfiguration = new aws.s3.BucketLifecycleConfigurationV2(
      `${options.config.environment}-viberglass-uploads-lifecycle`,
      {
        bucket: bucket.id,
        rules: rules,
      },
    );
  }

  // Create IAM policy for S3 access
  const s3AccessPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberglass-s3-access-policy`,
    {
      name: `${options.config.environment}-viberglass-s3-access-policy`,
      policy: pulumi.interpolate`{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "s3:PutObject",
            "s3:GetObject",
            "s3:DeleteObject"
          ],
          "Resource": "${bucket.arn}/*"
        },
        {
          "Effect": "Allow",
          "Action": ["s3:ListBucket"],
          "Resource": "${bucket.arn}"
        }
      ]
    }`,
      tags: options.config.tags,
    },
  );

  return {
    bucketName: bucket.bucket,
    bucketArn: bucket.arn,
    bucketId: bucket.id,
    accessPolicyArn: s3AccessPolicy.arn,
  };
}
