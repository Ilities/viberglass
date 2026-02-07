import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";

/**
 * CloudWatch alarms configuration options.
 */
export interface AlarmsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** SNS topic ARN for alarm notifications */
  snsTopicArn: pulumi.Input<string>;
  /** ECS cluster name */
  ecsClusterName: pulumi.Input<string>;
  /** ECS service name */
  ecsServiceName: pulumi.Input<string>;
  /** RDS instance identifier */
  rdsInstanceIdentifier: pulumi.Input<string>;
  /** ALB ARN suffix (for metrics) */
  albArnSuffix?: pulumi.Input<string>;
  /** Lambda function name for workers (optional) */
  workerFunctionName?: pulumi.Input<string>;
}

/**
 * CloudWatch alarms outputs.
 */
export interface AlarmsOutputs {
  /** Alarm ARNs */
  alarmArns: pulumi.Output<string>[];
  /** Alarm names */
  alarmNames: string[];
}

/**
 * Creates comprehensive CloudWatch alarms for production monitoring.
 *
 * This creates alarms for:
 * - ECS service health (task count, CPU, memory)
 * - ALB health (5xx errors, response time)
 * - RDS health (CPU, storage, connections)
 * - Lambda worker failures (if configured)
 *
 * All alarms notify the provided SNS topic.
 */
export function createCloudWatchAlarms(
  options: AlarmsOptions,
): AlarmsOutputs {
  const {
    config,
    snsTopicArn,
    ecsClusterName,
    ecsServiceName,
    rdsInstanceIdentifier,
    albArnSuffix,
    workerFunctionName,
  } = options;

  const alarms: aws.cloudwatch.MetricAlarm[] = [];
  const isProd = config.environment === "prod";

  // =================================================================
  // ECS Service Alarms
  // =================================================================

  // ECS: Low task count (critical - service is down)
  const ecsTaskCountAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-ecs-task-count-low`,
    {
      alarmName: `${config.environment}-viberglass-ecs-task-count-low`,
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 2,
      metricName: "RunningTaskCount",
      namespace: "ECS/ContainerInsights",
      period: 60,
      statistic: "Average",
      threshold: 1,
      alarmDescription:
        "Backend has fewer than 1 running task - service is down",
      dimensions: {
        ClusterName: ecsClusterName,
        ServiceName: ecsServiceName,
      },
      alarmActions: [snsTopicArn],
      treatMissingData: "breaching",
      tags: config.tags,
    },
  );
  alarms.push(ecsTaskCountAlarm);

  // ECS: High CPU utilization
  const ecsCpuAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-ecs-cpu-high`,
    {
      alarmName: `${config.environment}-viberglass-ecs-cpu-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "CPUUtilization",
      namespace: "AWS/ECS",
      period: 300,
      statistic: "Average",
      threshold: isProd ? 80 : 90,
      alarmDescription: `ECS CPU above ${isProd ? 80 : 90}% for 15 minutes`,
      dimensions: {
        ClusterName: ecsClusterName,
        ServiceName: ecsServiceName,
      },
      alarmActions: [snsTopicArn],
      tags: config.tags,
    },
  );
  alarms.push(ecsCpuAlarm);

  // ECS: High memory utilization
  const ecsMemoryAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-ecs-memory-high`,
    {
      alarmName: `${config.environment}-viberglass-ecs-memory-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "MemoryUtilization",
      namespace: "AWS/ECS",
      period: 300,
      statistic: "Average",
      threshold: isProd ? 80 : 90,
      alarmDescription: `ECS memory above ${isProd ? 80 : 90}% for 15 minutes`,
      dimensions: {
        ClusterName: ecsClusterName,
        ServiceName: ecsServiceName,
      },
      alarmActions: [snsTopicArn],
      tags: config.tags,
    },
  );
  alarms.push(ecsMemoryAlarm);

  // =================================================================
  // ALB Alarms (if ALB is configured)
  // =================================================================

  if (albArnSuffix) {
    // ALB: High 5xx error rate
    const alb5xxAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-alb-5xx-high`,
      {
        alarmName: `${config.environment}-viberglass-alb-5xx-high`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 2,
        metricName: "HTTPCode_Target_5XX_Count",
        namespace: "AWS/ApplicationELB",
        period: 300,
        statistic: "Sum",
        threshold: isProd ? 10 : 20,
        alarmDescription: `More than ${isProd ? 10 : 20} 5xx errors in 5 minutes`,
        dimensions: {
          LoadBalancer: albArnSuffix,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(alb5xxAlarm);

    // ALB: High response time
    const albResponseTimeAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-alb-response-time-high`,
      {
        alarmName: `${config.environment}-viberglass-alb-response-time-high`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 3,
        metricName: "TargetResponseTime",
        namespace: "AWS/ApplicationELB",
        period: 300,
        statistic: "Average",
        threshold: 2, // 2 seconds
        alarmDescription: "Average response time above 2 seconds for 15 minutes",
        dimensions: {
          LoadBalancer: albArnSuffix,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(albResponseTimeAlarm);

    // ALB: Unhealthy target count
    const albUnhealthyTargetsAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-alb-unhealthy-targets`,
      {
        alarmName: `${config.environment}-viberglass-alb-unhealthy-targets`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 2,
        metricName: "UnHealthyHostCount",
        namespace: "AWS/ApplicationELB",
        period: 60,
        statistic: "Average",
        threshold: 0,
        alarmDescription: "One or more ALB targets are unhealthy",
        dimensions: {
          LoadBalancer: albArnSuffix,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(albUnhealthyTargetsAlarm);
  }

  // =================================================================
  // RDS Database Alarms
  // =================================================================

  // RDS: High CPU utilization
  const rdsCpuAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-rds-cpu-high`,
    {
      alarmName: `${config.environment}-viberglass-rds-cpu-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "CPUUtilization",
      namespace: "AWS/RDS",
      period: 300,
      statistic: "Average",
      threshold: isProd ? 80 : 90,
      alarmDescription: `RDS CPU above ${isProd ? 80 : 90}% for 15 minutes`,
      dimensions: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      alarmActions: [snsTopicArn],
      tags: config.tags,
    },
  );
  alarms.push(rdsCpuAlarm);

  // RDS: Low free storage space
  const rdsStorageAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-rds-storage-low`,
    {
      alarmName: `${config.environment}-viberglass-rds-storage-low`,
      comparisonOperator: "LessThanThreshold",
      evaluationPeriods: 1,
      metricName: "FreeStorageSpace",
      namespace: "AWS/RDS",
      period: 300,
      statistic: "Average",
      threshold: 5_000_000_000, // 5GB in bytes
      alarmDescription: "RDS free storage below 5GB",
      dimensions: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      alarmActions: [snsTopicArn],
      tags: config.tags,
    },
  );
  alarms.push(rdsStorageAlarm);

  // RDS: High database connections
  const rdsConnectionsAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-rds-connections-high`,
    {
      alarmName: `${config.environment}-viberglass-rds-connections-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 2,
      metricName: "DatabaseConnections",
      namespace: "AWS/RDS",
      period: 300,
      statistic: "Average",
      threshold: 80, // Assuming max_connections = 100
      alarmDescription: "RDS connection count above 80",
      dimensions: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      alarmActions: [snsTopicArn],
      tags: config.tags,
    },
  );
  alarms.push(rdsConnectionsAlarm);

  // RDS: High read latency
  const rdsReadLatencyAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-rds-read-latency-high`,
    {
      alarmName: `${config.environment}-viberglass-rds-read-latency-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "ReadLatency",
      namespace: "AWS/RDS",
      period: 300,
      statistic: "Average",
      threshold: 0.1, // 100ms
      alarmDescription: "RDS read latency above 100ms for 15 minutes",
      dimensions: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      alarmActions: [snsTopicArn],
      treatMissingData: "notBreaching",
      tags: config.tags,
    },
  );
  alarms.push(rdsReadLatencyAlarm);

  // RDS: High write latency
  const rdsWriteLatencyAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-rds-write-latency-high`,
    {
      alarmName: `${config.environment}-viberglass-rds-write-latency-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 3,
      metricName: "WriteLatency",
      namespace: "AWS/RDS",
      period: 300,
      statistic: "Average",
      threshold: 0.1, // 100ms
      alarmDescription: "RDS write latency above 100ms for 15 minutes",
      dimensions: {
        DBInstanceIdentifier: rdsInstanceIdentifier,
      },
      alarmActions: [snsTopicArn],
      treatMissingData: "notBreaching",
      tags: config.tags,
    },
  );
  alarms.push(rdsWriteLatencyAlarm);

  // =================================================================
  // Lambda Worker Alarms (if Lambda workers are configured)
  // =================================================================

  if (workerFunctionName) {
    // Lambda: High error rate
    const lambdaErrorsAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-worker-errors-high`,
      {
        alarmName: `${config.environment}-viberglass-worker-errors-high`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "Errors",
        namespace: "AWS/Lambda",
        period: 300,
        statistic: "Sum",
        threshold: 5,
        alarmDescription: "More than 5 worker errors in 5 minutes",
        dimensions: {
          FunctionName: workerFunctionName,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(lambdaErrorsAlarm);

    // Lambda: High throttling
    const lambdaThrottlesAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-worker-throttles-high`,
      {
        alarmName: `${config.environment}-viberglass-worker-throttles-high`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 1,
        metricName: "Throttles",
        namespace: "AWS/Lambda",
        period: 300,
        statistic: "Sum",
        threshold: 10,
        alarmDescription: "More than 10 worker throttles in 5 minutes",
        dimensions: {
          FunctionName: workerFunctionName,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(lambdaThrottlesAlarm);

    // Lambda: Long duration (approaching timeout)
    const lambdaDurationAlarm = new aws.cloudwatch.MetricAlarm(
      `${config.environment}-viberglass-worker-duration-high`,
      {
        alarmName: `${config.environment}-viberglass-worker-duration-high`,
        comparisonOperator: "GreaterThanThreshold",
        evaluationPeriods: 2,
        metricName: "Duration",
        namespace: "AWS/Lambda",
        period: 300,
        statistic: "Average",
        threshold: 840000, // 14 minutes (Lambda timeout is 15 min)
        alarmDescription: "Worker execution time approaching timeout",
        dimensions: {
          FunctionName: workerFunctionName,
        },
        alarmActions: [snsTopicArn],
        treatMissingData: "notBreaching",
        tags: config.tags,
      },
    );
    alarms.push(lambdaDurationAlarm);
  }

  // =================================================================
  // Custom Application Metrics (to be emitted by application)
  // =================================================================

  // These alarms monitor custom metrics that the application should emit

  const ticketProcessingFailuresAlarm = new aws.cloudwatch.MetricAlarm(
    `${config.environment}-viberglass-ticket-failures-high`,
    {
      alarmName: `${config.environment}-viberglass-ticket-failures-high`,
      comparisonOperator: "GreaterThanThreshold",
      evaluationPeriods: 1,
      metricName: "ViberatorFailures",
      namespace: "Viberglass/Application",
      period: 300,
      statistic: "Sum",
      threshold: 5,
      alarmDescription: "More than 5 Viberator execution failures in 5 minutes",
      alarmActions: [snsTopicArn],
      treatMissingData: "notBreaching",
      tags: config.tags,
    },
  );
  alarms.push(ticketProcessingFailuresAlarm);

  return {
    alarmArns: alarms.map((alarm) => alarm.arn),
    alarmNames: alarms.map((alarm) =>
      pulumi.output(alarm.alarmName).apply((name) => name as string),
    ),
  };
}
