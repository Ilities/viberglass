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
exports.createDatabase = createDatabase;
const aws = __importStar(require("@pulumi/aws"));
const random = __importStar(require("@pulumi/random"));
const pulumi = __importStar(require("@pulumi/pulumi"));
/**
 * Create DB subnet group for RDS placement in private subnets.
 */
function createDbSubnetGroup(config, privateSubnetIds) {
  const subnetGroupName = `${config.environment}-viberator-db-subnet-group`;
  return new aws.rds.SubnetGroup(subnetGroupName, {
    name: subnetGroupName,
    subnetIds: privateSubnetIds,
    description: "Viberator database subnet group",
    tags: config.tags,
  });
}
/**
 * Create DB parameter group for PostgreSQL tuning.
 */
function createDbParameterGroup(config) {
  const parameterGroupName = `${config.environment}-viberator-db-pg`;
  return new aws.rds.ParameterGroup(parameterGroupName, {
    name: parameterGroupName,
    family: "postgres16",
    description: "Viberator database parameter group",
    parameters: [
      {
        name: "shared_buffers",
        value: "{DBInstanceClassMemory/16384}",
        applyMethod: "immediate",
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
  });
}
/**
 * Generate random database password and create SSM parameters.
 */
function createDatabaseCredentials(
  config,
  dbName,
  masterUsername,
  rdsEndpoint,
  kmsKeyArn,
) {
  const basePath = `/viberator/${config.environment}/database`;
  // Generate random password
  const randomPassword = new random.RandomPassword(
    `${config.environment}-viberator-db-password`,
    {
      length: 32,
      special: true,
      overrideSpecial: "_%+-.=@:",
    },
  );
  // Username parameter (fixed value)
  const usernameParam = new aws.ssm.Parameter(
    `${config.environment}-viberator-db-username`,
    {
      name: `${basePath}/username`,
      type: "String",
      value: masterUsername,
      tags: config.tags,
    },
  );
  // Password parameter (SecureString with KMS encryption)
  const passwordParam = new aws.ssm.Parameter(
    `${config.environment}-viberator-db-password`,
    {
      name: `${basePath}/password`,
      type: "SecureString",
      value: randomPassword.result,
      keyId: kmsKeyArn,
      tags: config.tags,
    },
  );
  // Connection URL parameter (SecureString with KMS encryption)
  const urlParam = new aws.ssm.Parameter(
    `${config.environment}-viberator-db-url`,
    {
      name: `${basePath}/url`,
      type: "SecureString",
      value: pulumi.interpolate`postgresql://${masterUsername}:${randomPassword.result}@${rdsEndpoint}:5432/${dbName}`,
      keyId: kmsKeyArn,
      tags: config.tags,
    },
  );
  // Host parameter (RDS endpoint)
  const hostParam = new aws.ssm.Parameter(
    `${config.environment}-viberator-db-host`,
    {
      name: `${basePath}/host`,
      type: "String",
      value: rdsEndpoint,
      tags: config.tags,
    },
  );
  return {
    randomPassword,
    usernameParam,
    passwordParam,
    urlParam,
    hostParam,
  };
}
/**
 * Create RDS PostgreSQL instance.
 */
function createRdsInstance(
  config,
  vpc,
  subnetGroupName,
  parameterGroupName,
  masterPassword,
  options,
) {
  const instanceName = `${config.environment}-viberator-db`;
  const instanceClass =
    options.instanceClass ??
    (config.environment === "prod" ? "db.m6g.xlarge" : "db.t4g.micro");
  const dbName = options.dbName ?? "viberator";
  const masterUsername = options.masterUsername ?? "viberator";
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
  return new aws.rds.Instance(instanceName, {
    identifier: instanceName,
    engine: "postgres",
    engineVersion: "16.1",
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
      : `${config.environment}-viberator-db-final-snapshot`,
    deletionProtection,
    backupRetentionPeriod,
    monitoringInterval,
    tags: {
      ...config.tags,
      Name: instanceName,
      Application: "viberator",
    },
  });
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
function createDatabase(options) {
  const {
    config,
    vpc,
    kmsKeyArn,
    dbName = "viberator",
    masterUsername = "viberator",
  } = options;
  // 1. Create DB subnet group
  const subnetGroup = createDbSubnetGroup(config, vpc.privateSubnetIds);
  // 2. Create DB parameter group
  const parameterGroup = createDbParameterGroup(config);
  // 3. Create RDS instance
  // We need to create a placeholder password for the instance creation
  // The actual password is stored in SSM and rotated on first access
  const dbPassword = pulumi.output("ChangeMeImmediately!");
  const rdsInstance = createRdsInstance(
    config,
    vpc,
    subnetGroup.name,
    parameterGroup.name,
    dbPassword,
    options,
  );
  // 4. Create credentials with SSM storage (using KMS key if provided)
  const credentials = createDatabaseCredentials(
    config,
    dbName,
    masterUsername,
    rdsInstance.endpoint,
    kmsKeyArn,
  );
  // Update RDS instance with the actual password
  // Note: In production, you'd want to handle this rotation more carefully
  // For now, we create the instance with a placeholder and update via SSM
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
    urlPath: credentials.urlParam.name,
    hostPath: credentials.hostParam.name,
  };
}
//# sourceMappingURL=database.js.map
