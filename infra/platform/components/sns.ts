import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * SNS topic configuration options.
 */
export interface SnsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** Email addresses to receive alarm notifications */
  emailAddresses?: string[];
  /** KMS key ARN for SNS encryption (optional) */
  kmsKeyArn?: pulumi.Input<string>;
}

/**
 * SNS topic outputs.
 */
export interface SnsOutputs {
  /** SNS topic ARN */
  topicArn: pulumi.Output<string>;
  /** SNS topic name */
  topicName: pulumi.Output<string>;
  /** Subscription ARNs */
  subscriptionArns: pulumi.Output<string>[];
}

/**
 * Creates SNS topic for CloudWatch alarms and operational notifications.
 *
 * This creates:
 * - SNS topic with encryption
 * - Email subscriptions for alarm notifications
 * - Display name for easy identification
 *
 * The email addresses must confirm their subscription after deployment.
 */
export function createSnsTopicForAlarms(options: SnsOptions): SnsOutputs {
  const { config, emailAddresses = [], kmsKeyArn } = options;

  const topicName = `${config.environment}-viberglass-alarms`;

  // Create SNS topic
  const topic = new aws.sns.Topic(topicName, {
    name: topicName,
    displayName: `Viberglass ${config.environment.toUpperCase()} Alarms`,
    kmsMasterKeyId: kmsKeyArn,
    tags: {
      ...config.tags,
      Purpose: "CloudWatch Alarms",
    },
  });

  // Create email subscriptions
  const subscriptions: aws.sns.TopicSubscription[] = [];
  emailAddresses.forEach((email, index) => {
    const subscription = new aws.sns.TopicSubscription(
      `${topicName}-email-${index}`,
      {
        topic: topic.arn,
        protocol: "email",
        endpoint: email,
      },
    );
    subscriptions.push(subscription);
  });

  // Store SNS topic ARN in SSM for easy reference
  new aws.ssm.Parameter(`${config.environment}-viberglass-sns-topic-arn`, {
    name: `/viberglass/${config.environment}/sns/alarms-topic-arn`,
    type: "String",
    value: topic.arn,
    description: "SNS topic ARN for CloudWatch alarms",
    tags: config.tags,
  });

  return {
    topicArn: topic.arn,
    topicName: topic.name,
    subscriptionArns: subscriptions.map((sub) => sub.arn),
  };
}
