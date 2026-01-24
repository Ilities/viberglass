import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Load balancer component configuration options.
 */
export interface LoadBalancerOptions {
  /** Environment name for resource naming */
  environment: string;
  /** Project name for resource naming (default: "viberglass") */
  projectName?: string;
  /** VPC ID for the load balancer */
  vpcId: pulumi.Input<string>;
  /** Public subnet IDs for the load balancer (at least 2 for HA) */
  publicSubnetIds: pulumi.Input<pulumi.Input<string>[]>;
  /** VPC CIDR block for security group rules */
  vpcCidr: pulumi.Input<string>;
  /** Backend security group ID for allowing traffic from ALB */
  backendSecurityGroupId: pulumi.Input<string>;
  /** ACM certificate ARN for HTTPS (optional - HTTP-only for MVP) */
  certificateArn?: pulumi.Input<string> | undefined;
  /** Backend port for target group (default: 80, assumes SSL termination at ALB) */
  backendPort?: number;
  /** Health check path (default: /health) */
  healthCheckPath?: string;
  /** Common tags applied to all resources */
  tags?: { [key: string]: string };
}

/**
 * Load balancer component outputs.
 */
export interface LoadBalancerOutputs {
  /** ALB DNS name for accessing the load balancer */
  albDnsName: pulumi.Output<string>;
  /** ALB canonical hosted zone ID for Route 53 alias records */
  albCanonicalHostedZoneId: pulumi.Output<string>;
  /** ALB ARN */
  albArn: pulumi.Output<string>;
  /** Target group ARN for ECS service attachment */
  targetGroupArn: pulumi.Output<string>;
  /** Target group name */
  targetGroupName: pulumi.Output<string>;
  /** ALB security group ID for allowing inbound traffic */
  albSecurityGroupId: pulumi.Output<string>;
  /** HTTP listener ARN */
  httpListenerArn: pulumi.Output<string>;
  /** HTTPS listener ARN (undefined if no certificate) */
  httpsListenerArn: pulumi.Output<string> | undefined;
}

/**
 * Creates an Application Load Balancer for the backend API.
 *
 * This creates:
 * - Internet-facing ALB in public subnets
 * - Security group allowing HTTP/HTTPS from internet
 * - Target group with health checks on /health
 * - HTTP listener (redirects to HTTPS if certificate provided)
 * - HTTPS listener (forwards to target group if certificate provided)
 *
 * For MVP: HTTP-only is acceptable. The HTTPS listener is only created
 * if a certificate ARN is provided.
 */
export function createLoadBalancer(options: LoadBalancerOptions): LoadBalancerOutputs {
  const projectName = options.projectName ?? "viberglass";
  const backendPort = options.backendPort ?? 80;
  const healthCheckPath = options.healthCheckPath ?? "/health";

  const defaultTags = {
    Project: projectName,
    Environment: options.environment,
    ManagedBy: "pulumi",
    ...options.tags,
  };

  // 1. Create ALB Security Group
  const albSecurityGroup = new aws.ec2.SecurityGroup(
    `${options.environment}-viberglass-alb-sg`,
    {
      description: "Security group for Viberglass Application Load Balancer",
      vpcId: options.vpcId,
      ingress: [
        {
          description: "HTTP from internet",
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          description: "HTTPS from internet",
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      egress: [
        {
          description: "Allow all outbound traffic to backend",
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
      tags: {
        Name: `${projectName}-${options.environment}-alb-sg`,
        ...defaultTags,
      },
    }
  );

  // Allow traffic from ALB to backend security group
  const albToBackendRule = new aws.ec2.SecurityGroupRule(
    `${options.environment}-viberglass-alb-to-backend`,
    {
      description: "Allow traffic from ALB to backend",
      type: "egress",
      fromPort: backendPort,
      toPort: backendPort,
      protocol: "tcp",
      securityGroupId: albSecurityGroup.id,
      sourceSecurityGroupId: options.backendSecurityGroupId,
    }
  );

  const backendFromAlbRule = new aws.ec2.SecurityGroupRule(
    `${options.environment}-viberglass-backend-from-alb`,
    {
      description: "Allow traffic from ALB to backend",
      type: "ingress",
      fromPort: backendPort,
      toPort: backendPort,
      protocol: "tcp",
      securityGroupId: options.backendSecurityGroupId,
      sourceSecurityGroupId: albSecurityGroup.id,
    }
  );

  // 2. Create Target Group
  const targetGroup = new aws.lb.TargetGroup(
    `${options.environment}-viberglass-backend-tg`,
    {
      name: `${projectName}-${options.environment}-backend-tg`,
      port: backendPort,
      protocol: "HTTP",
      vpcId: options.vpcId,
      targetType: "ip", // Fargate uses IP targets
      healthCheck: {
        enabled: true,
        path: healthCheckPath,
        interval: 30,
        timeout: 5,
        healthyThreshold: 3,
        unhealthyThreshold: 3,
        matcher: "200",
        port: "traffic-port",
        protocol: "HTTP",
      },
      tags: {
        Name: `${projectName}-${options.environment}-backend-tg`,
        ...defaultTags,
      },
    },
    {
      aliases: [{ name: `${options.environment}-viberator-backend-tg` }],
    }
  );

  // 3. Create Application Load Balancer
  const loadBalancer = new aws.lb.LoadBalancer(
    `${options.environment}-viberglass-alb`,
    {
      name: `${projectName}-${options.environment}-alb`,
      internal: false, // Internet-facing
      loadBalancerType: "application",
      securityGroups: [albSecurityGroup.id],
      subnets: options.publicSubnetIds,
      enableHttp2: true,
      enableCrossZoneLoadBalancing: true,
      tags: {
        Name: `${projectName}-${options.environment}-alb`,
        ...defaultTags,
      },
    },
    {
      aliases: [{ name: `${options.environment}-viberator-alb` }],
    }
  );

  // 4. Create HTTP Listener (port 80)
  const httpListener = new aws.lb.Listener(
    `${options.environment}-viberglass-http-listener`,
    {
      loadBalancerArn: loadBalancer.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: options.certificateArn
        ? [
            {
              type: "redirect",
              redirect: {
                port: "443",
                protocol: "HTTPS",
                statusCode: "HTTP_301",
              },
            },
          ]
        : [
            {
              type: "forward",
              targetGroupArn: targetGroup.arn,
            },
          ],
      }
  );

  // 5. Create HTTPS Listener (port 443) - only if certificate provided
  let httpsListener: aws.lb.Listener | undefined;
  if (options.certificateArn) {
    httpsListener = new aws.lb.Listener(
      `${options.environment}-viberglass-https-listener`,
      {
        loadBalancerArn: loadBalancer.arn,
        port: 443,
        protocol: "HTTPS",
        certificateArn: options.certificateArn,
        sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01", // Modern TLS policy
        defaultActions: [
          {
            type: "forward",
            targetGroupArn: targetGroup.arn,
          },
        ],
      }
    );
  }

  return {
    albDnsName: loadBalancer.dnsName,
    albCanonicalHostedZoneId: loadBalancer.zoneId,
    albArn: loadBalancer.arn,
    targetGroupArn: targetGroup.arn,
    targetGroupName: targetGroup.name,
    albSecurityGroupId: albSecurityGroup.id,
    httpListenerArn: pulumi.all([httpListener.arn, albToBackendRule.id]).apply(([arn]) => arn),
    httpsListenerArn: httpsListener?.arn,
  };
}
