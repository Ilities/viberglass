import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";
/**
 * VPC outputs required for database placement
 */
export interface VpcOutputsForDatabase {
  /** Private subnet IDs for RDS placement */
  privateSubnetIds: pulumi.Output<string[]>;
  /** Security group ID for RDS */
  rdsSecurityGroupId: pulumi.Output<string>;
}
/**
 * Database component configuration options.
 */
export interface DatabaseOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  /** VPC outputs for subnet and security group references */
  vpc: VpcOutputsForDatabase;
  /** KMS key ARN for SSM parameter encryption (optional, uses AWS default if not provided) */
  kmsKeyArn?: pulumi.Input<string>;
  /** Database instance class (default: db.t4g.micro for dev) */
  instanceClass?: string;
  /** Allocated storage in GB (default: 20) */
  allocatedStorage?: number;
  /** Database name (default: viberator) */
  dbName?: string;
  /** Master username (default: viberator) */
  masterUsername?: string;
  /** Enable Multi-AZ deployment (default: false) */
  multiAz?: boolean;
  /** Backup retention period in days (default: 1 for dev, 7 for prod) */
  backupRetentionPeriod?: number;
  /** Enable deletion protection (default: false for dev, true for prod) */
  deletionProtection?: boolean;
  /** Skip final snapshot on deletion (default: true for dev, false for prod) */
  skipFinalSnapshot?: boolean;
  /** Enable Enhanced Monitoring with interval (default: 0 for disabled, 60 for prod) */
  monitoringInterval?: number;
}
/**
 * Database subnet group and parameter group outputs.
 */
export interface DatabaseSubnetOutputs {
  /** DB subnet group name */
  subnetGroupName: pulumi.Output<string>;
  /** DB parameter group name */
  parameterGroupName: pulumi.Output<string>;
}
/**
 * RDS instance outputs.
 */
export interface RdsInstanceOutputs {
  /** RDS instance endpoint */
  endpoint: pulumi.Output<string>;
  /** RDS instance port */
  port: number;
  /** RDS instance ARN */
  instanceArn: pulumi.Output<string>;
  /** Database name */
  databaseName: string;
}
/**
 * Database SSM parameter outputs.
 */
export interface DatabaseSsmOutputs {
  /** SSM parameter path for username */
  usernamePath: pulumi.Output<string>;
  /** SSM parameter path for password */
  passwordPath: pulumi.Output<string>;
  /** SSM parameter path for connection URL */
  urlPath: pulumi.Output<string>;
  /** SSM parameter path for host */
  hostPath: pulumi.Output<string>;
}
/**
 * Complete database component outputs.
 */
export interface DatabaseOutputs
  extends DatabaseSubnetOutputs, RdsInstanceOutputs, DatabaseSsmOutputs {}
/**
 * Creates RDS PostgreSQL database infrastructure.
 *
 * This creates:
 * - DB subnet group for private subnet placement
 * - DB parameter group for PostgreSQL performance tuning
 * - Random password generation with SSM SecureString storage
 * - RDS PostgreSQL instance with appropriate sizing per environment
 * - SSM parameters for connection details
 *
 * Dev: db.t4g.micro, single-AZ, no deletion protection
 * Staging: db.t4g.large, single-AZ, no deletion protection
 * Prod: db.m6g.xlarge, multi-AZ, deletion protection enabled
 */
export declare function createDatabase(
  options: DatabaseOptions,
): DatabaseOutputs;
