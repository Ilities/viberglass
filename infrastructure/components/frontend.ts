import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * Frontend component configuration options.
 */
export interface FrontendOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Backend API URL for build-time injection */
  backendUrl: pulumi.Input<string>;
  /** Prefix for bucket name (default: "viberator-frontend") */
  bucketPrefix?: string;
  /** CloudFront price class (default: PriceClass_100 for dev/staging, PriceClass_All for prod) */
  priceClass?: "PriceClass_100" | "PriceClass_200" | "PriceClass_All";
  /** ACM certificate ARN for custom domain (optional) */
  certificateArn?: pulumi.Input<string> | undefined;
  /** Custom domain name (optional) */
  customDomain?: string;
}

/**
 * Frontend component outputs.
 */
export interface FrontendOutputs {
  /** S3 bucket name for frontend static assets */
  bucketName: pulumi.Output<string>;
  /** S3 bucket ARN */
  bucketArn: pulumi.Output<string>;
  /** S3 bucket ID */
  bucketId: pulumi.Output<string>;
  /** CloudFront distribution domain name */
  cloudfrontDomainName: pulumi.Output<string>;
  /** CloudFront distribution ID */
  cloudfrontDistributionId: pulumi.Output<string>;
  /** SSM parameter path for API URL */
  ssmApiUrlPath: string;
  /** SSM parameter path for CDN URL */
  ssmCdnUrlPath: string;
  /** Frontend URL (CloudFront domain or custom domain) */
  frontendUrl: pulumi.Output<string>;
}

/**
 * Creates S3 bucket and CloudFront distribution for frontend hosting.
 *
 * This creates:
 * - S3 bucket for static site hosting
 * - Server-side encryption (AES256)
 * - Origin Access Control (OAC) for secure CloudFront access
 * - CloudFront distribution with HTTPS redirect
 * - Custom error responses for SPA routing
 * - SSM parameters for API URL and CDN URL
 */
export function createFrontend(options: FrontendOptions): FrontendOutputs {
  const bucketPrefix = options.bucketPrefix ?? "viberator-frontend";
  const priceClass = options.priceClass ??
    (options.config.environment === "prod" ? "PriceClass_All" : "PriceClass_100");

  const defaultTags = {
    Project: "viberator",
    Environment: options.config.environment,
    ManagedBy: "pulumi",
    ...options.config.tags,
  };

  // Generate unique bucket name with random suffix
  const randomSuffix = pulumi.interpolate`${pulumi.getStack()}-${Math.random().toString(36).substring(2, 8)}`;
  const bucketName = pulumi.interpolate`${options.config.environment}-${bucketPrefix}-${randomSuffix}`;

  // 1. Create S3 bucket for frontend
  const bucket = new aws.s3.BucketV2(`${options.config.environment}-viberator-frontend-bucket`, {
    bucket: bucketName,
    tags: defaultTags,
  });

  // 2. Enable server-side encryption with AES256
  const encryption = new aws.s3.BucketServerSideEncryptionConfigurationV2(
    `${options.config.environment}-viberator-frontend-encryption`,
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
    }
  );

  // 3. Block public access (using OAC instead)
  const publicAccessBlock = new aws.s3.BucketPublicAccessBlock(
    `${options.config.environment}-viberator-frontend-public-block`,
    {
      bucket: bucket.id,
      blockPublicAcls: true,
      blockPublicPolicy: true,
      ignorePublicAcls: true,
      restrictPublicBuckets: true,
    }
  );

  // 4. Create Origin Access Control for CloudFront
  const originAccessControl = new aws.cloudfront.OriginAccessControl(
    `${options.config.environment}-viberator-frontend-oac`,
    {
      description: "Origin Access Control for Viberator frontend S3 bucket",
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4",
    }
  );

  // 5. Create CloudFront Distribution
  // Get the S3 regional domain name for the origin
  const bucketRegionalDomainName = bucket.bucketRegionalDomainName;

  const distribution = new aws.cloudfront.Distribution(
    `${options.config.environment}-viberator-frontend-distribution`,
    {
      enabled: true,
      priceClass: priceClass,
      httpVersion: "http2and3",
      origins: [
        {
          originId: "s3Origin",
          domainName: bucketRegionalDomainName,
          originAccessControlId: originAccessControl.id,
        },
      ],
      defaultCacheBehavior: {
        targetOriginId: "s3Origin",
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD"],
        compress: true,
        defaultTtl: 86400, // 1 day
        minTtl: 0,
        maxTtl: 31536000, // 1 year
        forwardedValues: {
          queryString: false,
          cookies: {
            forward: "none",
          },
        },
        viewerProtocolPolicy: "redirect-to-https",
      },
      customErrorResponses: [
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: "/index.html",
        },
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: "/index.html",
        },
      ],
      defaultRootObject: "index.html",
      restrictions: {
        geoRestriction: {
          restrictionType: "none",
        },
      },
      viewerCertificate: options.certificateArn
        ? {
            acmCertificateArn: options.certificateArn,
            sslSupportMethod: "sni-only",
            minimumProtocolVersion: "TLSv1.2_2021",
          }
        : {
            cloudfrontDefaultCertificate: true,
          },
      tags: {
        Name: `viberator-${options.config.environment}-frontend`,
        ...defaultTags,
      },
    }
  );

  // 6. Update S3 bucket policy to allow CloudFront OAC access
  const bucketPolicy = new aws.s3.BucketPolicy(
    `${options.config.environment}-viberator-frontend-bucket-policy`,
    {
      bucket: bucket.id,
      policy: pulumi.interpolate`{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Sid": "AllowCloudFrontOACAccess",
            "Effect": "Allow",
            "Principal": {
              "Service": "cloudfront.amazonaws.com"
            },
            "Action": "s3:GetObject",
            "Resource": "${bucket.arn}/*",
            "Condition": {
              "StringEquals": {
                "AWS:SourceArn": "${distribution.arn}"
              }
            }
          }
        ]
      }`,
    }
  );

  // 7. Create SSM parameters for frontend configuration
  const ssmApiUrlPath = `/viberator/${options.config.environment}/frontend/apiUrl`;
  const ssmCdnUrlPath = `/viberator/${options.config.environment}/frontend/cdnUrl`;

  const apiUrlParam = new aws.ssm.Parameter(
    `${options.config.environment}-viberator-frontend-api-url`,
    {
      name: ssmApiUrlPath,
      type: "String",
      value: options.backendUrl,
      tags: defaultTags,
    }
  );

  const cdnUrlParam = new aws.ssm.Parameter(
    `${options.config.environment}-viberator-frontend-cdn-url`,
    {
      name: ssmCdnUrlPath,
      type: "String",
      value: pulumi.interpolate`https://${distribution.domainName}`,
      tags: defaultTags,
    }
  );

  // Determine frontend URL
  const finalFrontendUrl = options.customDomain
    ? pulumi.interpolate`https://${options.customDomain}`
    : pulumi.interpolate`https://${distribution.domainName}`;

  return {
    bucketName: bucket.bucket,
    bucketArn: bucket.arn,
    bucketId: bucket.id,
    cloudfrontDomainName: distribution.domainName,
    cloudfrontDistributionId: distribution.id,
    ssmApiUrlPath,
    ssmCdnUrlPath,
    frontendUrl: finalFrontendUrl,
  };
}
