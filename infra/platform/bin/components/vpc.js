"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VpcComponent = void 0;
exports.createVpc = createVpc;
const pulumi = __importStar(require("@pulumi/pulumi"));
const aws = __importStar(require("@pulumi/aws"));
/**
 * Creates a VPC with public and private subnets, NAT gateways, and security groups
 */
class VpcComponent {
  constructor(name, config) {
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
    const commonTags = {
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
      const privateRouteTable = new aws.ec2.RouteTable(
        `${name}-private-rt-${i}`,
        {
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
        },
      );
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
  createBackendSecurityGroup(
    name,
    projectName,
    environment,
    backendPort,
    commonTags,
  ) {
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
  createRdsSecurityGroup(name, projectName, environment, commonTags) {
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
  createWorkerSecurityGroup(name, projectName, environment, commonTags) {
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
  outputs() {
    return {
      vpcId: this.vpc.id,
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
exports.VpcComponent = VpcComponent;
/**
 * Helper function to create VPC and export outputs
 */
function createVpc(name, config) {
  const component = new VpcComponent(name, config);
  return component.outputs();
}
//# sourceMappingURL=vpc.js.map
