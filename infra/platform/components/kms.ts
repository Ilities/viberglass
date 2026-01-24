import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * KMS component configuration options.
 */
export interface KmsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** IAM role ARNs that can use this key for decryption */
  keyUserRoleArns?: pulumi.Input<pulumi.Input<string>[]>;
}

/**
 * KMS component outputs.
 */
export interface KmsOutputs {
  /** KMS Key ID */
  keyId: pulumi.Output<string>;
  /** KMS Key ARN */
  keyArn: pulumi.Output<string>;
  /** KMS Alias name */
  aliasName: string;
}

/**
 * Creates a KMS key for SSM Parameter Store encryption.
 *
 * This creates a customer-managed KMS key with:
 * - Automatic key rotation enabled (annual)
 * - Key policy allowing root account full access
 * - Key policy allowing compute roles (Lambda/ECS) to decrypt
 * - Friendly alias for easy reference
 *
 * The key is used to encrypt SSM SecureString parameters containing
 * sensitive configuration like database passwords and API keys.
 */
export function createKmsKey(options: KmsOptions): KmsOutputs {
  const aliasName = `alias/viberglass-${options.config.environment}-ssm`;
  const callerIdentity = aws.getCallerIdentity({});

  // Get account ID for root policy statement
  const accountId = callerIdentity.then(id => id.accountId);

  // Create KMS key with automatic rotation
  const key = new aws.kms.Key(`${options.config.environment}-viberglass-ssm-key`, {
    description: `Viberator SSM encryption key for ${options.config.environment}`,
    enableKeyRotation: true,
    tags: options.config.tags,
  });

  // Key policy as JSON string with interpolated values
  const keyPolicyDocument = pulumi
    .all([accountId, options.keyUserRoleArns ?? pulumi.output([])])
    .apply(([accountId, roleArns]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "EnableRoot",
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "kms:*",
            Resource: "*",
          },
          ...(roleArns.length > 0
            ? [
                {
                  Sid: "AllowRolesUse",
                  Effect: "Allow",
                  Principal: {
                    AWS: roleArns,
                  },
                  Action: ["kms:Decrypt", "kms:GenerateDataKey*"],
                  Resource: "*",
                },
              ]
            : []),
        ],
      })
    );

  // Apply the key policy
  new aws.kms.KeyPolicy(`${options.config.environment}-viberglass-ssm-key-policy`, {
    keyId: key.id,
    policy: keyPolicyDocument,
  });

  // Create alias for easy reference
  new aws.kms.Alias(`${options.config.environment}-viberglass-ssm-alias`, {
    name: aliasName,
    targetKeyId: key.id,
  });

  return {
    keyId: key.id,
    keyArn: key.arn,
    aliasName,
  };
}
