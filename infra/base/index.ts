import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { getConfig } from "./config";

/**
 * Viberglass Base Infrastructure Stack
 *
 * This stack creates shared infrastructure used by platform and workers stacks:
 * - VPC with public/private subnets
 * - NAT Gateway(s) for private subnet internet access
 * - Security Groups (backend, RDS, worker)
 * - KMS key for SSM encryption
 * - CloudWatch log groups
 *
 * Other stacks reference this via StackReference to share these resources.
 */

// Load configuration from Pulumi stack
const config = getConfig();

// Common tags for all resources
const commonTags: Record<string, string> = {
  Environment: config.environment,
  Project: "viberglass",
  ManagedBy: "pulumi",
};

// =============================================================================
// VPC INFRASTRUCTURE
// =============================================================================

const vpcCidr = "10.0.0.0/16";
const availabilityZones = ["eu-west-1a", "eu-west-1b"];
const publicSubnetCidrs = ["10.0.1.0/24", "10.0.2.0/24"];
const privateSubnetCidrs = ["10.0.10.0/24", "10.0.11.0/24"];

// Create VPC
const vpc = new aws.ec2.Vpc(`${config.environment}-viberglass-vpc`, {
  cidrBlock: vpcCidr,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `viberglass-${config.environment}-vpc`,
    ...commonTags,
  },
});

// Create Internet Gateway
const internetGateway = new aws.ec2.InternetGateway(
  `${config.environment}-viberglass-igw`,
  {
    vpcId: vpc.id,
    tags: {
      Name: `viberglass-${config.environment}-igw`,
      ...commonTags,
    },
  },
);

// Create Public Subnets
const publicSubnets = availabilityZones.map((az, index) => {
  return new aws.ec2.Subnet(
    `${config.environment}-viberglass-public-${index}`,
    {
      vpcId: vpc.id,
      cidrBlock: publicSubnetCidrs[index],
      availabilityZone: az,
      mapPublicIpOnLaunch: true,
      tags: {
        Name: `viberglass-${config.environment}-public-${az}`,
        Type: "public",
        ...commonTags,
      },
    },
  );
});

// Create Public Route Table
const publicRouteTable = new aws.ec2.RouteTable(
  `${config.environment}-viberglass-public-rt`,
  {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
      },
    ],
    tags: {
      Name: `viberglass-${config.environment}-public-rt`,
      ...commonTags,
    },
  },
);

// Associate public subnets with public route table
publicSubnets.forEach((subnet, index) => {
  new aws.ec2.RouteTableAssociation(
    `${config.environment}-viberglass-public-rta-${index}`,
    {
      subnetId: subnet.id,
      routeTableId: publicRouteTable.id,
    },
  );
});

// Create Private Subnets
const privateSubnets = availabilityZones.map((az, index) => {
  return new aws.ec2.Subnet(
    `${config.environment}-viberglass-private-${index}`,
    {
      vpcId: vpc.id,
      cidrBlock: privateSubnetCidrs[index],
      availabilityZone: az,
      mapPublicIpOnLaunch: false,
      tags: {
        Name: `viberglass-${config.environment}-private-${az}`,
        Type: "private",
        ...commonTags,
      },
    },
  );
});

// Create NAT Gateways (enterprise mode only)
const useNatGateway = config.networkMode === "enterprise";
const natGatewayCount = useNatGateway
  ? config.singleNatGateway
    ? 1
    : availabilityZones.length
  : 0;
const privateRouteTableCount = useNatGateway ? natGatewayCount : 1;
const natEips: aws.ec2.Eip[] = [];
const natGateways: aws.ec2.NatGateway[] = [];
const privateRouteTables: aws.ec2.RouteTable[] = [];

for (let i = 0; i < privateRouteTableCount; i++) {
  let natGatewayId: pulumi.Input<string> | undefined;

  if (useNatGateway) {
    // Allocate Elastic IP for NAT Gateway
    const eip = new aws.ec2.Eip(
      `${config.environment}-viberglass-nat-eip-${i}`,
      {
        domain: "vpc",
        tags: {
          Name: `viberglass-${config.environment}-nat-eip-${i}`,
          ...commonTags,
        },
      },
    );
    natEips.push(eip);

    // Create NAT Gateway in public subnet
    const natGateway = new aws.ec2.NatGateway(
      `${config.environment}-viberglass-nat-${i}`,
      {
        allocationId: eip.allocationId,
        subnetId: publicSubnets[i].id,
        tags: {
          Name: `viberglass-${config.environment}-nat-${i}`,
          ...commonTags,
        },
      },
    );
    natGateways.push(natGateway);
    natGatewayId = natGateway.id;
  }

  // Create private route table for this AZ's private subnets
  const privateRouteTable = new aws.ec2.RouteTable(
    `${config.environment}-viberglass-private-rt-${i}`,
    {
      vpcId: vpc.id,
      routes: natGatewayId
        ? [
            {
              cidrBlock: "0.0.0.0/0",
              natGatewayId: natGatewayId,
            },
          ]
        : [],
      tags: {
        Name: `viberglass-${config.environment}-private-rt-${i}`,
        ...commonTags,
      },
    },
  );
  privateRouteTables.push(privateRouteTable);

  // Associate private subnets with their route table
  // If single NAT or no NAT, associate all private subnets to the single route table
  const privateSubnetIndices =
    !useNatGateway || config.singleNatGateway
      ? availabilityZones.map((_, idx) => idx)
      : [i];

  privateSubnetIndices.forEach((subnetIndex) => {
    if (subnetIndex < privateSubnets.length) {
      new aws.ec2.RouteTableAssociation(
        `${config.environment}-viberglass-private-rta-${subnetIndex}`,
        {
          subnetId: privateSubnets[subnetIndex].id,
          routeTableId: privateRouteTable.id,
        },
      );
    }
  });
}

// =============================================================================
// SECURITY GROUPS
// =============================================================================

// Backend Security Group
const backendSecurityGroup = new aws.ec2.SecurityGroup(
  `${config.environment}-viberglass-backend-sg`,
  {
    description: "Security group for backend services",
    vpcId: vpc.id,
    ingress: [
      {
        description: "Backend port from VPC",
        fromPort: 3000,
        toPort: 3000,
        protocol: "tcp",
        cidrBlocks: [vpcCidr],
      },
    ],
    egress: [
      {
        description: "Allow all outbound traffic",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `viberglass-${config.environment}-backend-sg`,
      ...commonTags,
    },
  },
);

// RDS Security Group
const rdsSecurityGroup = new aws.ec2.SecurityGroup(
  `${config.environment}-viberglass-rds-sg`,
  {
    description: "Security group for RDS PostgreSQL",
    vpcId: vpc.id,
    ingress: [
      {
        description: "PostgreSQL from backend only",
        fromPort: 5432,
        toPort: 5432,
        protocol: "tcp",
        securityGroups: [backendSecurityGroup.id],
      },
    ],
    egress: [
      {
        description: "Allow all outbound traffic",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `viberglass-${config.environment}-rds-sg`,
      ...commonTags,
    },
  },
);

// Worker Security Group
const workerSecurityGroup = new aws.ec2.SecurityGroup(
  `${config.environment}-viberglass-worker-sg`,
  {
    description: "Security group for ECS workers",
    vpcId: vpc.id,
    ingress: [
      {
        description: "Allow callbacks from backend",
        fromPort: 0,
        toPort: 65535,
        protocol: "tcp",
        securityGroups: [backendSecurityGroup.id],
      },
    ],
    egress: [
      {
        description: "Allow all outbound for git, API calls",
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: `viberglass-${config.environment}-worker-sg`,
      ...commonTags,
    },
  },
);

// =============================================================================
// KMS KEY FOR SSM ENCRYPTION
// =============================================================================

const callerIdentity = aws.getCallerIdentity({});
const accountId = callerIdentity.then((id) => id.accountId);

// Create KMS key with automatic rotation
const kmsKey = new aws.kms.Key(`${config.environment}-viberglass-ssm-key`, {
  description: `Viberglass SSM encryption key for ${config.environment}`,
  enableKeyRotation: true,
  tags: commonTags,
});

// Key policy
const keyPolicyDocument = pulumi.all([accountId]).apply(([accountId]) =>
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
    ],
  }),
);

new aws.kms.KeyPolicy(`${config.environment}-viberglass-ssm-key-policy`, {
  keyId: kmsKey.id,
  policy: keyPolicyDocument,
});

// Create alias for easy reference
const kmsAliasName = `alias/viberglass-${config.environment}-ssm`;
new aws.kms.Alias(`${config.environment}-viberglass-ssm-alias`, {
  name: kmsAliasName,
  targetKeyId: kmsKey.id,
});

// =============================================================================
// CLOUDWATCH LOG GROUPS
// =============================================================================

// Lambda worker log group
const lambdaLogGroup = new aws.cloudwatch.LogGroup(
  `${config.environment}-viberglass-lambda-logs`,
  {
    name: `/aws/lambda/viberglass-${config.environment}-worker`,
    retentionInDays: config.logRetentionDays,
    tags: commonTags,
  },
);

// ECS worker log group
const ecsWorkerLogGroup = new aws.cloudwatch.LogGroup(
  `${config.environment}-viberglass-ecs-worker-logs`,
  {
    name: `/ecs/viberglass-${config.environment}-worker`,
    retentionInDays: config.logRetentionDays,
    tags: commonTags,
  },
);

// Backend log group
const backendLogGroup = new aws.cloudwatch.LogGroup(
  `${config.environment}-viberglass-backend-logs`,
  {
    name: `/ecs/viberglass-${config.environment}-backend`,
    retentionInDays: config.logRetentionDays,
    tags: commonTags,
  },
);

// =============================================================================
// STACK EXPORTS
// =============================================================================

// Environment info
export const awsRegion = config.awsRegion;
export const environment = config.environment;
export const networkMode = config.networkMode;

// VPC outputs
export const vpcId = vpc.id;
export const vpcCidrOutput = vpc.cidrBlock;
export const publicSubnetIds = pulumi.all(publicSubnets.map((s) => s.id));
export const privateSubnetIds = pulumi.all(privateSubnets.map((s) => s.id));
export const natGatewayIds = pulumi.all(natGateways.map((n) => n.id));
export const natGatewayPublicIps = pulumi.all(natEips.map((e) => e.publicIp));
export const internetGatewayId = internetGateway.id;

// Security group outputs
export const backendSecurityGroupId = backendSecurityGroup.id;
export const rdsSecurityGroupId = rdsSecurityGroup.id;
export const workerSecurityGroupId = workerSecurityGroup.id;

// KMS outputs
export const kmsKeyId = kmsKey.id;
export const kmsKeyArn = kmsKey.arn;
export const kmsAliasNameOutput = kmsAliasName;

// Logging outputs
export const lambdaLogGroupName = lambdaLogGroup.name;
export const lambdaLogGroupArn = lambdaLogGroup.arn;
export const ecsWorkerLogGroupName = ecsWorkerLogGroup.name;
export const ecsWorkerLogGroupArn = ecsWorkerLogGroup.arn;
export const backendLogGroupName = backendLogGroup.name;
export const backendLogGroupArn = backendLogGroup.arn;
