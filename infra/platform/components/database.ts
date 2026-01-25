import * as aws from "@pulumi/aws";
import * as random from "@pulumi/random";
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
  /** Database name (default: viberglass) */
  dbName?: string;
  /** Master username (default: viberglass) */
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
  urlPathArn: pulumi.Output<string>;
  /** SSM parameter path for host */
  hostPathArn: pulumi.Output<string>;
}

/**
 * Complete database component outputs.
 */
export interface DatabaseOutputs
  extends DatabaseSubnetOutputs, RdsInstanceOutputs, DatabaseSsmOutputs {}

/**
 * Create DB subnet group for RDS placement in private subnets.
 */
function createDbSubnetGroup(
  config: InfrastructureConfig,
  privateSubnetIds: pulumi.Output<string[]>,
): aws.rds.SubnetGroup {
  const subnetGroupName = `${config.environment}-viberglass-db-subnet-group`;

  return new aws.rds.SubnetGroup(
    subnetGroupName,
    {
      name: subnetGroupName,
      subnetIds: privateSubnetIds,
      description: "Viberglass database subnet group",
      tags: config.tags,
    },
    {
      aliases: [{ name: `${config.environment}-viberator-db-subnet-group` }],
    },
  );
}

/**
 * Create DB parameter group for PostgreSQL tuning.
 */
function createDbParameterGroup(
  config: InfrastructureConfig,
): aws.rds.ParameterGroup {
  const parameterGroupName = `${config.environment}-viberglass-db-pg`;

  return new aws.rds.ParameterGroup(
    parameterGroupName,
    {
      name: parameterGroupName,
      family: "postgres18",
      description: "Viberglass database parameter group",
      parameters: [
        {
          name: "shared_buffers",
          value: "{DBInstanceClassMemory/16384}",
          applyMethod: "pending-reboot",
        },
        {
          name: "max_connections",
          value: "100",
          applyMethod: "pending-reboot",
        },
        {
          name: "log_min_duration_statement",
          value: "1000",
          applyMethod: "immediate",
        },
        {
          name: "log_statement",
          value: "all",
          applyMethod: "immediate",
        },
      ],
      tags: config.tags,
    },
    {
      aliases: [{ name: `${config.environment}-viberator-db-pg` }],
    },
  );
}

/**
 * Generate random database password and create base SSM parameters.
 */
function createDatabaseCredentials(
  config: InfrastructureConfig,
  masterUsername: string,
  kmsKeyArn?: pulumi.Input<string>,
): {
  randomPassword: random.RandomPassword;
  usernameParam: aws.ssm.Parameter;
  passwordParam: aws.ssm.Parameter;
} {
  const basePath = `/viberglass/${config.environment}/database`;

  // Generate random password
  const randomPassword = new random.RandomPassword(
    `${config.environment}-viberglass-db-password`,
    {
      length: 32,
      special: true,
      overrideSpecial: `_%+-.=:`,
    },
  );

  // Username parameter (fixed value)
  const usernameParam = new aws.ssm.Parameter(
    `${config.environment}-viberglass-db-username`,
    {
      name: `${basePath}/username`,
      type: "String",
      value: masterUsername,
      tags: config.tags,
      overwrite: true,
    },
  );

  // Password parameter (SecureString with KMS encryption)
  const passwordParam = new aws.ssm.Parameter(
    `${config.environment}-viberglass-db-password`,
    {
      name: `${basePath}/password`,
      type: "SecureString",
      value: randomPassword.result,
      keyId: kmsKeyArn,
      tags: config.tags,
      overwrite: true,
    },
  );

  return {
    randomPassword,
    usernameParam,
    passwordParam,
  };
}

/**
 * Create RDS PostgreSQL instance.
 */
function createRdsInstance(
  config: InfrastructureConfig,
  vpc: VpcOutputsForDatabase,
  subnetGroupName: pulumi.Input<string>,
  parameterGroupName: pulumi.Input<string>,
  masterPassword: pulumi.Input<string>,
  options: DatabaseOptions,
): aws.rds.Instance {
  const instanceName = `${config.environment}-viberglass-db`;
  const instanceClass =
    options.instanceClass ??
    (config.environment === "prod" ? "db.m6g.xlarge" : "db.t4g.micro");
  const dbName = options.dbName ?? "viberglass";
  const masterUsername = options.masterUsername ?? "viberglass";
  const allocatedStorage = options.allocatedStorage ?? 20;
  const multiAz = options.multiAz ?? config.environment === "prod";
  const backupRetentionPeriod =
    options.backupRetentionPeriod ?? (config.environment === "prod" ? 7 : 1);
  const deletionProtection =
    options.deletionProtection ?? config.environment === "prod";
  const skipFinalSnapshot =
    options.skipFinalSnapshot ?? config.environment !== "prod";
  const monitoringInterval =
    options.monitoringInterval ?? (config.environment === "prod" ? 60 : 0);

  return new aws.rds.Instance(
    instanceName,
    {
      identifier: instanceName,
      engine: "postgres",
      engineVersion: "18.1",
      instanceClass,
      allocatedStorage,
      storageType: "gp3",
      storageEncrypted: true,
      dbName,
      username: masterUsername,
      password: masterPassword,
      port: 5432,
      vpcSecurityGroupIds: [vpc.rdsSecurityGroupId],
      dbSubnetGroupName: subnetGroupName,
      parameterGroupName,
      multiAz,
      publiclyAccessible: false,
      skipFinalSnapshot,
      finalSnapshotIdentifier: skipFinalSnapshot
        ? undefined
        : `${config.environment}-viberglass-db-final-snapshot`,
      deletionProtection,
      backupRetentionPeriod,
      monitoringInterval,
      tags: {
        ...config.tags,
        Name: instanceName,
        Application: "viberglass",
      },
    },
    {
      aliases: [{ name: `${config.environment}-viberator-db` }],
    },
  );
}

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
export function createDatabase(options: DatabaseOptions): DatabaseOutputs {
  const {
    config,
    vpc,
    kmsKeyArn,
    dbName = "viberglass",
    masterUsername = "viberglass",
  } = options;

  // 1. Create DB subnet group
  const subnetGroup = createDbSubnetGroup(config, vpc.privateSubnetIds);

  // 2. Create DB parameter group
  const parameterGroup = createDbParameterGroup(config);

  // 3. Create credentials with SSM storage first (generates random password)
  const credentials = createDatabaseCredentials(
    config,
    masterUsername,
    kmsKeyArn,
  );

  // 4. Create RDS instance with the random password
  const rdsInstance = createRdsInstance(
    config,
    vpc,
    subnetGroup.name,
    parameterGroup.name,
    credentials.randomPassword.result,
    options,
  );

  // 5. Create SSM parameters with actual RDS endpoint
  const basePath = `/viberglass/${config.environment}/database`;

  // Create new URL and host parameters with the actual endpoint
  const urlParam = new aws.ssm.Parameter(
    `${config.environment}-viberglass-db-url-actual`,
    {
      name: `${basePath}/url`,
      type: "SecureString",
      value: pulumi.interpolate`postgresql://${masterUsername}:${credentials.randomPassword.result}@${rdsInstance.endpoint}:5432/${dbName}`,
      keyId: kmsKeyArn,
      tags: config.tags,
      overwrite: true,
    },
  );

  const hostParam = new aws.ssm.Parameter(
    `${config.environment}-viberglass-db-host-actual`,
    {
      name: `${basePath}/host`,
      type: "String",
      value: rdsInstance.endpoint,
      tags: config.tags,
      overwrite: true,
    },
  );

  return {
    // Subnet and parameter groups
    subnetGroupName: subnetGroup.name,
    parameterGroupName: parameterGroup.name,

    // RDS instance
    endpoint: rdsInstance.endpoint,
    port: 5432,
    instanceArn: rdsInstance.arn,
    databaseName: dbName,

    // SSM parameters
    usernamePath: credentials.usernameParam.name,
    passwordPath: credentials.passwordParam.name,
    urlPathArn: urlParam.arn,
    hostPathArn: hostParam.arn,
  };
}
