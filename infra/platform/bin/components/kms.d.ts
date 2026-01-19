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
export declare function createKmsKey(options: KmsOptions): KmsOutputs;
