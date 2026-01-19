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
exports.createWorkerLambda = createWorkerLambda;
const aws = __importStar(require("@pulumi/aws"));
const awsx = __importStar(require("@pulumi/awsx"));
const path = __importStar(require("path"));
/**
 * Creates a Lambda worker function triggered by SQS.
 *
 * The Lambda runs in a container image from ECR and processes
 * jobs from the SQS queue. It has access to SSM Parameter Store
 * for tenant-specific credentials (GitHub tokens, Claude API keys).
 */
function createWorkerLambda(options) {
  const timeout = options.timeout ?? 900;
  const memorySize = options.memorySize ?? 2048;
  const contextPath =
    options.contextPath ?? path.join(__dirname, "../../viberator");
  const dockerfilePath =
    options.dockerfilePath ??
    path.join(contextPath, "docker/viberator-lambda.Dockerfile");
  // Build and publish the container image to ECR
  const image = new awsx.ecr.Image(
    `${options.config.environment}-viberator-worker-image`,
    {
      repositoryUrl: options.repositoryUrl,
      context: contextPath,
      dockerfile: dockerfilePath,
      platform: "linux/amd64",
    },
  );
  // IAM role for Lambda
  const lambdaRole = new aws.iam.Role(
    `${options.config.environment}-viberator-lambda-role`,
    {
      assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "lambda.amazonaws.com",
      }),
      tags: options.config.tags,
    },
  );
  // Attach basic execution role policy
  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberator-lambda-basic-exec`,
    {
      role: lambdaRole.name,
      policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    },
  );
  // Attach SQS execution role policy
  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberator-lambda-sqs-exec`,
    {
      role: lambdaRole.name,
      policyArn: aws.iam.ManagedPolicy.AWSLambdaSQSQueueExecutionRole,
    },
  );
  // SSM policy for tenant-aware credential access
  const ssmPolicy = new aws.iam.Policy(
    `${options.config.environment}-viberator-ssm-policy`,
    {
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Effect: "Allow",
            Resource: `arn:aws:ssm:${options.config.awsRegion}:*:parameter/viberator/tenants/*`,
          },
        ],
      },
      tags: options.config.tags,
    },
  );
  new aws.iam.RolePolicyAttachment(
    `${options.config.environment}-viberator-lambda-ssm`,
    {
      role: lambdaRole.name,
      policyArn: ssmPolicy.arn,
    },
  );
  // Create the Lambda function using the image from ECR
  const workerLambda = new aws.lambda.Function(
    `${options.config.environment}-viberator-worker`,
    {
      packageType: "Image",
      imageUri: image.imageUri,
      role: lambdaRole.arn,
      timeout: timeout,
      memorySize: memorySize,
      environment: {
        variables: {
          HOME: "/tmp",
          NODE_ENV: "production",
          LOG_FORMAT: "json",
          CLAUDE_CONFIG_DIR: "/tmp/config",
          TENANT_CONFIG_PATH_PREFIX: "/viberator/tenants",
        },
      },
      tags: options.config.tags,
    },
  );
  // Trigger Lambda from SQS
  const eventSourceMapping = new aws.lambda.EventSourceMapping(
    `${options.config.environment}-viberator-sqs-trigger`,
    {
      eventSourceArn: options.queue.queueArn,
      functionName: workerLambda.name,
      batchSize: 1,
    },
  );
  return {
    lambdaArn: workerLambda.arn,
    lambdaName: workerLambda.name,
    lambdaInvokeArn: workerLambda.invokeArn,
    eventSourceMappingId: eventSourceMapping.id,
    imageUri: image.imageUri,
    lambdaRoleName: lambdaRole.name,
  };
}
//# sourceMappingURL=worker-lambda.js.map
