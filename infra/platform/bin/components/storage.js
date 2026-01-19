"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStorage = createStorage;
const aws = __importStar(require("@pulumi/aws"));
const pulumi = __importStar(require("@pulumi/pulumi"));
/**
 * Gets lifecycle rules based on environment.
 *
 * Dev: Aggressive cleanup to save costs
 * Staging: Keep data longer with tiered storage
 * Prod: Long-term retention with Glacier archiving
 */
function getLifecycleRules(environment) {
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
function createStorage(options) {
  const bucketPrefix = options.bucketPrefix ?? "viberator-uploads";
  const versioningEnabled =
    options.versioningEnabled ?? options.config.environment !== "dev";
  // Generate unique bucket name with random suffix to avoid conflicts
  const randomSuffix = pulumi.interpolate`${pulumi.getStack()}-${Math.random().toString(36).substring(2, 8)}`;
  const bucketName = pulumi.interpolate`${options.config.environment}-${bucketPrefix}-${randomSuffix}`;
  // Create S3 bucket
  const bucket = new aws.s3.BucketV2(
    `${options.config.environment}-viberator-uploads-bucket`,
    {
      bucket: bucketName,
      tags: options.config.tags,
    },
  );
  // Enable server-side encryption with AES256
  const encryption = new aws.s3.BucketServerSideEncryptionConfiguration(
    `${options.config.environment}-viberator-uploads-encryption`,
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
    `${options.config.environment}-viberator-uploads-public-block`,
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    },
  );
  // Configure versioning
  const versioning = new aws.s3.BucketVersioning(
    `${options.config.environment}-viberator-uploads-versioning`,
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
  const rules = [];
  for (const rule of lifecycleRules) {
    const lifecycleRule = {
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
      lifecycleRule.noncurrentVersionTransition = [
        {
          newStorageClass: "STANDARD_IA",
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
    const transitions = [];
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
  let lifecycleConfiguration;
  if (rules.length > 0) {
    lifecycleConfiguration = new aws.s3.BucketLifecycleConfigurationV2(
      `${options.config.environment}-viberator-uploads-lifecycle`,
      {
        bucket: bucket.id,
        rules: rules,
      },
    );
  }
  // Create IAM policy for S3 access
  const s3AccessPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberator-s3-access-policy`,
    {
      name: `${options.config.environment}-viberator-s3-access-policy`,
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
//# sourceMappingURL=storage.js.map
