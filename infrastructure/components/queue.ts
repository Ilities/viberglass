import * as aws from "@pulumi/aws";
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
export function createQueue(options: QueueOptions): QueueOutputs {
  const visibilityTimeout = options.visibilityTimeoutSeconds ?? 900; // 15 minutes for Lambda max timeout
  const messageRetention = options.messageRetentionSeconds ?? 345600; // 4 days
  const maxReceiveCount = options.maxReceiveCount ?? 3;

  // Create dead letter queue for failed messages
  const deadLetterQueue = new aws.sqs.Queue(
    `${options.config.environment}-viberglass-worker-dlq`,
    {
      visibilityTimeoutSeconds: visibilityTimeout,
      messageRetentionSeconds: messageRetention,
      tags: options.config.tags,
    },
    {
      aliases: [{ name: `${options.config.environment}-viberator-worker-dlq` }],
    }
  );

  // Create main worker queue with redrive policy for DLQ
  const queue = new aws.sqs.Queue(`${options.config.environment}-viberglass-worker-queue`, {
    visibilityTimeoutSeconds: visibilityTimeout,
    messageRetentionSeconds: messageRetention,
    redrivePolicy: JSON.stringify({
      deadLetterTargetArn: deadLetterQueue.arn,
      maxReceiveCount: maxReceiveCount,
    }),
    tags: options.config.tags,
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-worker-queue` }],
  });

  return {
    queueUrl: queue.url,
    queueArn: queue.arn,
    queueId: queue.id,
    deadLetterQueueArn: deadLetterQueue.arn,
  };
}
