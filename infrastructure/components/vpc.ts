import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * VPC component configuration
 */
export interface VpcConfig {
  /** CIDR block for the VPC (default: 10.0.0.0/16) */
  vpcCidr?: string;
  /** Availability zones for subnets (default: us-east-1a, us-east-1b) */
  availabilityZones?: string[];
  /** CIDR blocks for public subnets (default: 10.0.1.0/24, 10.0.2.0/24) */
  publicSubnetCidrs?: string[];
  /** CIDR blocks for private subnets (default: 10.0.10.0/24, 10.0.11.0/24) */
  privateSubnetCidrs?: string[];
  /** Use single NAT gateway for cost savings (default: false) */
  singleNatGateway?: boolean;
  /** Environment name for tagging */
  environment: string;
  /** Project name for tagging */
  projectName?: string;
  /** Custom port for backend service (default: 3000) */
  backendPort?: number;
}

/**
 * VPC component outputs
 */
export interface VpcOutputs {
  vpcId: pulumi.Output<string>;
  vpcCidr: pulumi.Output<string>;
  publicSubnetIds: pulumi.Output<string[]>;
  privateSubnetIds: pulumi.Output<string[]>;
  natGatewayIds: pulumi.Output<string[]>;
  natGatewayPublicIps: pulumi.Output<string[]>;
  internetGatewayId: pulumi.Output<string>;
  backendSecurityGroupId: pulumi.Output<string>;
  rdsSecurityGroupId: pulumi.Output<string>;
  workerSecurityGroupId: pulumi.Output<string>;
}

/**
 * Creates a VPC with public and private subnets, NAT gateways, and security groups
 */
export class VpcComponent {
  public readonly vpc: aws.ec2.Vpc;
  public readonly internetGateway: aws.ec2.InternetGateway;
  public readonly publicSubnets: aws.ec2.Subnet[];
  public readonly privateSubnets: aws.ec2.Subnet[];
  public readonly natGateways: aws.ec2.NatGateway[];
  public readonly natEips: aws.ec2.Eip[];
  public readonly publicRouteTable: aws.ec2.RouteTable;
  public readonly privateRouteTables: aws.ec2.RouteTable[];
  public readonly backendSecurityGroup: aws.ec2.SecurityGroup;
  public readonly rdsSecurityGroup: aws.ec2.SecurityGroup;
  public readonly workerSecurityGroup: aws.ec2.SecurityGroup;

  constructor(name: string, config: VpcConfig) {
    const {
      vpcCidr = "10.0.0.0/16",
      availabilityZones = ["us-east-1a", "us-east-1b"],
      publicSubnetCidrs = ["10.0.1.0/24", "10.0.2.0/24"],
      privateSubnetCidrs = ["10.0.10.0/24", "10.0.11.0/24"],
      singleNatGateway = false,
      environment,
      projectName = "viberator",
      backendPort = 3000,
    } = config;

    // Common tags
    const commonTags: Record<string, string> = {
      Environment: environment,
      Project: projectName,
      ManagedBy: "pulumi",
    };

    // 1. Create VPC
    this.vpc = new aws.ec2.Vpc(name, {
      cidrBlock: vpcCidr,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: {
        Name: `${projectName}-${environment}-vpc`,
        ...commonTags,
      },
    });

    // 2. Create Internet Gateway
    this.internetGateway = new aws.ec2.InternetGateway(`${name}-igw`, {
      vpcId: this.vpc.id,
      tags: {
        Name: `${projectName}-${environment}-igw`,
        ...commonTags,
      },
    });

    // 3. Create Public Subnets
    this.publicSubnets = availabilityZones.map((az, index) => {
      const subnet = new aws.ec2.Subnet(`${name}-public-${index}`, {
        vpcId: this.vpc.id,
        cidrBlock: publicSubnetCidrs[index] || `10.0.${index + 1}.0/24`,
        availabilityZone: az,
        mapPublicIpOnLaunch: true,
        tags: {
          Name: `${projectName}-${environment}-public-${az}`,
          Type: "public",
          ...commonTags,
        },
      });
      return subnet;
    });

    // 4. Create Public Route Table
    this.publicRouteTable = new aws.ec2.RouteTable(`${name}-public-rt`, {
      vpcId: this.vpc.id,
      routes: [
        {
          cidrBlock: "0.0.0.0/0",
          gatewayId: this.internetGateway.id,
        },
      ],
      tags: {
        Name: `${projectName}-${environment}-public-rt`,
        ...commonTags,
      },
    });

    // Associate public subnets with public route table
    this.publicSubnets.forEach((subnet, index) => {
      new aws.ec2.RouteTableAssociation(`${name}-public-rta-${index}`, {
        subnetId: subnet.id,
        routeTableId: this.publicRouteTable.id,
      });
    });

    // 5. Create Private Subnets
    this.privateSubnets = availabilityZones.map((az, index) => {
      const subnet = new aws.ec2.Subnet(`${name}-private-${index}`, {
        vpcId: this.vpc.id,
        cidrBlock: privateSubnetCidrs[index] || `10.0.${index + 10}.0/24`,
        availabilityZone: az,
        mapPublicIpOnLaunch: false,
        tags: {
          Name: `${projectName}-${environment}-private-${az}`,
          Type: "private",
          ...commonTags,
        },
      });
      return subnet;
    });

    // 6. Create NAT Gateways (one per AZ, or single if cost-optimized)
    const natGatewayCount = singleNatGateway ? 1 : availabilityZones.length;
    this.natEips = [];
    this.natGateways = [];
    this.privateRouteTables = [];

    for (let i = 0; i < natGatewayCount; i++) {
      // Allocate Elastic IP for NAT Gateway
      const eip = new aws.ec2.Eip(`${name}-nat-eip-${i}`, {
        domain: "vpc",
        tags: {
          Name: `${projectName}-${environment}-nat-eip-${i}`,
          ...commonTags,
        },
      });
      this.natEips.push(eip);

      // Create NAT Gateway in public subnet
      const natGateway = new aws.ec2.NatGateway(`${name}-nat-${i}`, {
        allocationId: eip.allocationId,
        subnetId: this.publicSubnets[i].id,
        tags: {
          Name: `${projectName}-${environment}-nat-${i}`,
          ...commonTags,
        },
      });
      this.natGateways.push(natGateway);

      // Create private route table for this AZ's private subnets
      const privateRouteTable = new aws.ec2.RouteTable(`${name}-private-rt-${i}`, {
        vpcId: this.vpc.id,
        routes: [
          {
            cidrBlock: "0.0.0.0/0",
            natGatewayId: natGateway.id,
          },
        ],
        tags: {
          Name: `${projectName}-${environment}-private-rt-${i}`,
          ...commonTags,
        },
      });
      this.privateRouteTables.push(privateRouteTable);

      // Associate private subnets with their route table
      // If single NAT, associate all private subnets to the single route table
      const privateSubnetIndices = singleNatGateway
        ? availabilityZones.map((_, idx) => idx)
        : [i];

      privateSubnetIndices.forEach((subnetIndex) => {
        if (subnetIndex < this.privateSubnets.length) {
          new aws.ec2.RouteTableAssociation(
            `${name}-private-rta-${subnetIndex}`,
            {
              subnetId: this.privateSubnets[subnetIndex].id,
              routeTableId: privateRouteTable.id,
            },
          );
        }
      });
    }

    // 7. Create Security Groups (defined as readonly properties)
    this.backendSecurityGroup = this.createBackendSecurityGroup(
      name,
      projectName,
      environment,
      backendPort,
      commonTags,
    );
    this.rdsSecurityGroup = this.createRdsSecurityGroup(
      name,
      projectName,
      environment,
      commonTags,
    );
    this.workerSecurityGroup = this.createWorkerSecurityGroup(
      name,
      projectName,
      environment,
      commonTags,
    );
  }

  private createBackendSecurityGroup(
    name: string,
    projectName: string,
    environment: string,
    backendPort: number,
    commonTags: Record<string, string>,
  ): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup(`${name}-backend-sg`, {
      description: "Security group for backend services",
      vpcId: this.vpc.id,
      ingress: [
        {
          description: "HTTP from load balancer",
          fromPort: 80,
          toPort: 80,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          description: "HTTPS from load balancer",
          fromPort: 443,
          toPort: 443,
          protocol: "tcp",
          cidrBlocks: ["0.0.0.0/0"],
        },
        {
          description: `Backend port from VPC`,
          fromPort: backendPort,
          toPort: backendPort,
          protocol: "tcp",
          cidrBlocks: [this.vpc.cidrBlock],
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
        Name: `${projectName}-${environment}-backend-sg`,
        ...commonTags,
      },
    });
  }

  private createRdsSecurityGroup(
    name: string,
    projectName: string,
    environment: string,
    commonTags: Record<string, string>,
  ): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup(`${name}-rds-sg`, {
      description: "Security group for RDS PostgreSQL",
      vpcId: this.vpc.id,
      ingress: [
        {
          description: "PostgreSQL from backend only",
          fromPort: 5432,
          toPort: 5432,
          protocol: "tcp",
          securityGroups: [this.backendSecurityGroup.id],
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
        Name: `${projectName}-${environment}-rds-sg`,
        ...commonTags,
      },
    });
  }

  private createWorkerSecurityGroup(
    name: string,
    projectName: string,
    environment: string,
    commonTags: Record<string, string>,
  ): aws.ec2.SecurityGroup {
    return new aws.ec2.SecurityGroup(`${name}-worker-sg`, {
      description: "Security group for ECS workers",
      vpcId: this.vpc.id,
      ingress: [
        {
          description: "Allow callbacks from backend",
          fromPort: 0,
          toPort: 65535,
          protocol: "tcp",
          securityGroups: [this.backendSecurityGroup.id],
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
        Name: `${projectName}-${environment}-worker-sg`,
        ...commonTags,
      },
    });
  }

  /**
   * Get all VPC outputs as a single object
   */
  public outputs(): VpcOutputs {
    return {
      vpcId: this.vpc.id,
      vpcCidr: this.vpc.cidrBlock,
      publicSubnetIds: pulumi.all(this.publicSubnets.map((s) => s.id)),
      privateSubnetIds: pulumi.all(this.privateSubnets.map((s) => s.id)),
      natGatewayIds: pulumi.all(this.natGateways.map((n) => n.id)),
      natGatewayPublicIps: pulumi.all(this.natEips.map((e) => e.publicIp)),
      internetGatewayId: this.internetGateway.id,
      backendSecurityGroupId: this.backendSecurityGroup.id,
      rdsSecurityGroupId: this.rdsSecurityGroup.id,
      workerSecurityGroupId: this.workerSecurityGroup.id,
    };
  }
}

/**
 * Helper function to create VPC and export outputs
 */
export function createVpc(name: string, config: VpcConfig): VpcOutputs {
  const component = new VpcComponent(name, config);
  return component.outputs();
}
