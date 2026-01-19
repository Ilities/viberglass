import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";
/**
 * SQS queue configuration options.
 */
export interface QueueOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Visibility timeout in seconds (default: 900 = 15 minutes) */
  visibilityTimeoutSeconds?: number;
  /** Message retention period in seconds (default: 4 days) */
  messageRetentionSeconds?: number;
  /** Maximum receive count for dead letter queue */
  maxReceiveCount?: number;
}
/**
 * SQS queue component outputs.
 */
export interface QueueOutputs {
  /** Queue URL for sending messages */
  queueUrl: pulumi.Output<string>;
  /** Queue ARN for Lambda event source mapping */
  queueArn: pulumi.Output<string>;
  /** Queue ID */
  queueId: pulumi.Output<string>;
  /** Dead letter queue ARN (if created) */
  deadLetterQueueArn?: pulumi.Output<string | undefined>;
}
/**
 * Creates an SQS queue for worker job processing.
 *
 * The queue has a dead letter queue for failed messages
 * after the specified max receive count. This prevents
 * poison pill messages from blocking the queue indefinitely.
 */
export declare function createQueue(options: QueueOptions): QueueOutputs;
