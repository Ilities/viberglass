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
  /** ACM certificate ARN for HTTPS (optional - will create cert if apiDomain provided) */
  certificateArn?: pulumi.Input<string> | undefined;
  /** API domain name for ACM certificate and Route53 alias (e.g., "api.viberglass.io") */
  apiDomain?: pulumi.Input<string> | undefined;
  /** Route 53 hosted zone ID for DNS validation and alias record */
  route53ZoneId?: pulumi.Input<string> | undefined;
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
  /** ACM certificate ARN (if created or provided) */
  certificateArn: pulumi.Output<string> | undefined;
  /** API domain name (if configured) */
  apiDomain: pulumi.Output<string> | undefined;
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
 * - ACM certificate with DNS validation (if apiDomain and route53ZoneId provided)
 * - Route53 alias record for API domain (if apiDomain and route53ZoneId provided)
 */
export function createLoadBalancer(
  options: LoadBalancerOptions,
): LoadBalancerOutputs {
  const projectName = options.projectName ?? "viberglass";
  const backendPort = options.backendPort ?? 80;
  const healthCheckPath = options.healthCheckPath ?? "/health";

  const defaultTags = {
    Project: projectName,
    Environment: options.environment,
    ManagedBy: "pulumi",
    ...options.tags,
  };

  // Create ACM certificate and Route53 records if apiDomain and route53ZoneId are provided
  let certificate: aws.acm.Certificate | undefined;
  let certificateValidation: aws.acm.CertificateValidation | undefined;
  let apiDomainOutput: pulumi.Output<string> | undefined;

  if (options.apiDomain && options.route53ZoneId) {
    apiDomainOutput = pulumi.output(options.apiDomain);

    certificate = new aws.acm.Certificate(
      `${options.environment}-viberglass-api-cert`,
      {
        domainName: options.apiDomain,
        validationMethod: "DNS",
        tags: {
          Name: `${projectName}-${options.environment}-api-cert`,
          ...defaultTags,
        },
      },
    );

    // Create Route53 validation record
    const validationOption = certificate.domainValidationOptions[0];
    const certValidationRecord = new aws.route53.Record(
      `${options.environment}-viberglass-api-cert-validation`,
      {
        zoneId: options.route53ZoneId,
        name: validationOption.resourceRecordName,
        type: validationOption.resourceRecordType,
        records: [validationOption.resourceRecordValue],
        ttl: 60,
      },
    );

    // Wait for certificate validation
    certificateValidation = new aws.acm.CertificateValidation(
      `${options.environment}-viberglass-api-cert-validation`,
      {
        certificateArn: certificate.arn,
        validationRecordFqdns: [certValidationRecord.fqdn],
      },
    );
  }

  // Use provided certificate ARN or the validated certificate ARN
  const certificateArn = options.certificateArn ?? certificate?.arn;

  // Certificate must be validated before HTTPS listener can be created
  const validatedCertificateArn = certificateValidation
    ? certificateValidation.certificateArn
    : options.certificateArn ?? certificate?.arn;

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
    },
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
    },
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
    },
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
    },
  );

  // 4. Create HTTP Listener (port 80)
  const httpListener = new aws.lb.Listener(
    `${options.environment}-viberglass-http-listener`,
    {
      loadBalancerArn: loadBalancer.arn,
      port: 80,
      protocol: "HTTP",
      defaultActions: certificateArn
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
    },
  );

  // 5. Create HTTPS Listener (port 443) - only if certificate is validated
  let httpsListener: aws.lb.Listener | undefined;
  if (validatedCertificateArn) {
    httpsListener = new aws.lb.Listener(
      `${options.environment}-viberglass-https-listener`,
      {
        loadBalancerArn: loadBalancer.arn,
        port: 443,
        protocol: "HTTPS",
        certificateArn: validatedCertificateArn,
        sslPolicy: "ELBSecurityPolicy-TLS-1-2-2017-01", // Modern TLS policy
        defaultActions: [
          {
            type: "forward",
            targetGroupArn: targetGroup.arn,
          },
        ],
      },
    );
  }

  // 6. Create Route53 alias record for API domain (if configured)
  if (options.apiDomain && options.route53ZoneId) {
    new aws.route53.Record(
      `${options.environment}-viberglass-api-alias`,
      {
        zoneId: options.route53ZoneId,
        name: options.apiDomain,
        type: "A",
        aliases: [
          {
            name: loadBalancer.dnsName,
            zoneId: loadBalancer.zoneId,
            evaluateTargetHealth: true,
          },
        ],
      },
      // Ensure HTTPS listener is created first if we have a certificate
      {
        dependsOn: httpsListener ? [httpsListener] : [],
      },
    );
  }

  return {
    albDnsName: loadBalancer.dnsName,
    albCanonicalHostedZoneId: loadBalancer.zoneId,
    albArn: loadBalancer.arn,
    targetGroupArn: targetGroup.arn,
    targetGroupName: targetGroup.name,
    albSecurityGroupId: albSecurityGroup.id,
    httpListenerArn: pulumi
      .all([httpListener.arn, albToBackendRule.id])
      .apply(([arn]) => arn),
    httpsListenerArn: httpsListener?.arn,
    certificateArn: certificate?.arn,
    apiDomain: apiDomainOutput,
  };
}
