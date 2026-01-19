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
export declare class VpcComponent {
  readonly vpc: aws.ec2.Vpc;
  readonly internetGateway: aws.ec2.InternetGateway;
  readonly publicSubnets: aws.ec2.Subnet[];
  readonly privateSubnets: aws.ec2.Subnet[];
  readonly natGateways: aws.ec2.NatGateway[];
  readonly natEips: aws.ec2.Eip[];
  readonly publicRouteTable: aws.ec2.RouteTable;
  readonly privateRouteTables: aws.ec2.RouteTable[];
  readonly backendSecurityGroup: aws.ec2.SecurityGroup;
  readonly rdsSecurityGroup: aws.ec2.SecurityGroup;
  readonly workerSecurityGroup: aws.ec2.SecurityGroup;
  constructor(name: string, config: VpcConfig);
  private createBackendSecurityGroup;
  private createRdsSecurityGroup;
  private createWorkerSecurityGroup;
  /**
   * Get all VPC outputs as a single object
   */
  outputs(): VpcOutputs;
}
/**
 * Helper function to create VPC and export outputs
 */
export declare function createVpc(name: string, config: VpcConfig): VpcOutputs;
