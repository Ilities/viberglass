import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** The port apps listen on inside their tasks. */
const APP_PORT = 3000;

export interface AppHostingOptions {
  environment: string;
  awsRegion: string;
  vpcId: pulumi.Input<string>;
  vpcCidr: pulumi.Input<string>;
  /** Subnets app tasks run in, the same as the backend's. */
  subnetIds: pulumi.Input<string[]>;
  assignPublicIp: pulumi.Input<boolean>;
  /** The only security group apps accept connections from. */
  backendSecurityGroupId: pulumi.Input<string>;
  /** The uploads bucket, which holds apps' replicas and release bundles. */
  bucketArn: pulumi.Input<string>;
  containerInsights: boolean;
  tags: { [key: string]: string };
}

export interface AppHostingOutputs {
  clusterArn: pulumi.Output<string>;
  securityGroupId: pulumi.Output<string>;
  /** What the backend's EcsAppHost reads. */
  backendEnv: pulumi.Output<Record<string, string>>;
  /** Lets the backend run apps on the cluster and give each App space its task roles. */
  backendPolicy: pulumi.Output<string>;
}

/**
 * Where apps run on AWS: an ECS cluster of their own, a security group that
 * only the backend gets through, a private DNS namespace the backend finds
 * them in, and the permissions boundary every app's task role is created under.
 */
export function createAppHosting(options: AppHostingOptions): AppHostingOutputs {
  const name = `${options.environment}-viberglass-apps`;
  const prefix = `${options.environment}-viberglass`;
  const rolePath = `/viberglass/${options.environment}/apps/`;
  const accountId = aws.getCallerIdentityOutput().accountId;

  const cluster = new aws.ecs.Cluster(name, {
    settings: options.containerInsights ? [{ name: "containerInsights", value: "enabled" }] : [],
    tags: options.tags,
  });

  // Apps reach the internet over HTTP(S) and DNS, nothing else: the backend, RDS and workers don't accept them.
  const securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
    description: "Apps: only the backend reaches them; they reach only the internet",
    vpcId: options.vpcId,
    ingress: [{
      description: "The app gateway and health checks",
      fromPort: APP_PORT,
      toPort: APP_PORT,
      protocol: "tcp",
      securityGroups: [options.backendSecurityGroupId],
    }],
    egress: [
      { description: "HTTPS", fromPort: 443, toPort: 443, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
      { description: "HTTP", fromPort: 80, toPort: 80, protocol: "tcp", cidrBlocks: ["0.0.0.0/0"] },
      { description: "VPC DNS", fromPort: 53, toPort: 53, protocol: "udp", cidrBlocks: [options.vpcCidr] },
      { description: "VPC DNS", fromPort: 53, toPort: 53, protocol: "tcp", cidrBlocks: [options.vpcCidr] },
    ],
    tags: { Name: `${name}-sg`, ...options.tags },
  });

  const logGroup = new aws.cloudwatch.LogGroup(`${name}-logs`, {
    name: `/ecs/viberglass-${options.environment}-apps`,
    retentionInDays: options.environment === "prod" ? 30 : 14,
    tags: options.tags,
  });

  const namespace = new aws.servicediscovery.PrivateDnsNamespace(`${name}-dns`, {
    name: `apps.${options.environment}.viberglass.internal`,
    vpc: options.vpcId,
    description: "Where the backend finds apps",
    tags: options.tags,
  });

  const executionRole = new aws.iam.Role(`${name}-exec-role`, {
    name: `${name}-exec-role`,
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "ecs-tasks.amazonaws.com" }),
    tags: options.tags,
  });
  new aws.iam.RolePolicyAttachment(`${name}-exec-basic`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  // The most any app's role can do; each role's own policy narrows it to one App space.
  const boundary = new aws.iam.Policy(`${name}-boundary`, {
    name: `${name}-boundary`,
    description: "The most a Viberglass app's task role may do",
    policy: pulumi.output(options.bucketArn).apply((bucketArn) => JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        { Effect: "Allow", Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource: `${bucketArn}/spaces/*/app-data/*` },
        { Effect: "Allow", Action: ["s3:GetObject"], Resource: `${bucketArn}/spaces/*/releases/*` },
        { Effect: "Allow", Action: ["s3:ListBucket"], Resource: bucketArn },
      ],
    })),
    tags: options.tags,
  });

  const backendPolicy = pulumi
    .all([accountId, cluster.arn, cluster.name, namespace.arn, namespace.hostedZone, logGroup.arn, executionRole.arn, boundary.arn])
    .apply(([account, clusterArn, clusterName, namespaceArn, hostedZone, logGroupArn, executionRoleArn, boundaryArn]) => {
      const appRoles = `arn:aws:iam::${account}:role${rolePath}${prefix}-*`;
      return JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["ecs:CreateService", "ecs:UpdateService", "ecs:DeleteService", "ecs:DescribeServices"],
            Resource: `arn:aws:ecs:${options.awsRegion}:${account}:service/${clusterName}/${prefix}-*`,
          },
          {
            Effect: "Allow",
            Action: ["ecs:ListTasks", "ecs:DescribeTasks"],
            Resource: "*",
            Condition: { ArnEquals: { "ecs:cluster": clusterArn } },
          },
          {
            Effect: "Allow",
            Action: ["ecs:RegisterTaskDefinition", "ecs:DeregisterTaskDefinition", "ecs:ListTaskDefinitions", "ecs:DescribeTaskDefinition"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["ecs:TagResource"],
            Resource: "*",
            Condition: { StringEquals: { "ecs:CreateAction": ["CreateService", "RegisterTaskDefinition"] } },
          },
          {
            Effect: "Allow",
            Action: ["servicediscovery:CreateService", "servicediscovery:GetNamespace"],
            Resource: namespaceArn,
          },
          {
            Effect: "Allow",
            Action: ["servicediscovery:CreateService", "servicediscovery:GetService", "servicediscovery:DeleteService", "servicediscovery:TagResource"],
            Resource: `arn:aws:servicediscovery:${options.awsRegion}:${account}:service/*`,
          },
          { Effect: "Allow", Action: ["servicediscovery:ListServices"], Resource: "*" },
          {
            Effect: "Allow",
            Action: ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ChangeResourceRecordSets"],
            Resource: `arn:aws:route53:::hostedzone/${hostedZone}`,
          },
          {
            Effect: "Allow",
            Action: ["iam:CreateRole"],
            Resource: appRoles,
            Condition: { StringEquals: { "iam:PermissionsBoundary": boundaryArn } },
          },
          {
            Effect: "Allow",
            Action: ["iam:GetRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:ListRolePolicies", "iam:DeleteRole", "iam:TagRole"],
            Resource: appRoles,
          },
          {
            Effect: "Allow",
            Action: ["iam:PassRole"],
            Resource: [appRoles, executionRoleArn],
            Condition: { StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
          },
          { Effect: "Allow", Action: ["logs:GetLogEvents"], Resource: `${logGroupArn}:log-stream:*` },
        ],
      });
    });

  const backendEnv = pulumi
    .all({
      cluster: cluster.arn,
      subnetIds: pulumi.output(options.subnetIds).apply((ids) => ids.join(",")),
      securityGroupId: securityGroup.id,
      assignPublicIp: pulumi.output(options.assignPublicIp).apply(String),
      executionRoleArn: executionRole.arn,
      logGroup: logGroup.name,
      namespaceId: namespace.id,
      namespaceName: namespace.name,
      boundaryArn: boundary.arn,
    })
    .apply((values): Record<string, string> => ({
      ECS_APPS_PREFIX: prefix,
      ECS_APPS_CLUSTER: values.cluster,
      ECS_APPS_SUBNET_IDS: values.subnetIds,
      ECS_APPS_SECURITY_GROUP_ID: values.securityGroupId,
      ECS_APPS_ASSIGN_PUBLIC_IP: values.assignPublicIp,
      ECS_APPS_EXECUTION_ROLE_ARN: values.executionRoleArn,
      ECS_APPS_LOG_GROUP: values.logGroup,
      ECS_APPS_NAMESPACE_ID: values.namespaceId,
      ECS_APPS_NAMESPACE_NAME: values.namespaceName,
      ECS_APPS_ROLE_PATH: rolePath,
      ECS_APPS_PERMISSIONS_BOUNDARY_ARN: values.boundaryArn,
      // A Fargate task pulls its image every time it starts.
      APPS_HEALTH_TIMEOUT_MS: "300000",
    }));

  return { clusterArn: cluster.arn, securityGroupId: securityGroup.id, backendEnv, backendPolicy };
}
