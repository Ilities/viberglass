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
exports.createKmsKey = createKmsKey;
const aws = __importStar(require("@pulumi/aws"));
const pulumi = __importStar(require("@pulumi/pulumi"));
/**
 * Creates a KMS key for SSM Parameter Store encryption.
 *
 * This creates a customer-managed KMS key with:
 * - Automatic key rotation enabled (annual)
 * - Key policy allowing root account full access
 * - Key policy allowing compute roles (Lambda/ECS) to decrypt
 * - Friendly alias for easy reference
 *
 * The key is used to encrypt SSM SecureString parameters containing
 * sensitive configuration like database passwords and API keys.
 */
function createKmsKey(options) {
  const aliasName = `alias/viberator-${options.config.environment}-ssm`;
  const callerIdentity = aws.getCallerIdentity({});
  // Get account ID for root policy statement
  const accountId = callerIdentity.then((id) => id.accountId);
  // Create KMS key with automatic rotation
  const key = new aws.kms.Key(
    `${options.config.environment}-viberator-ssm-key`,
    {
      description: `Viberator SSM encryption key for ${options.config.environment}`,
      enableKeyRotation: true,
      tags: options.config.tags,
    },
  );
  // Key policy as JSON string with interpolated values
  const keyPolicyDocument = pulumi
    .all([accountId, options.keyUserRoleArns ?? pulumi.output([])])
    .apply(([accountId, roleArns]) =>
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
          ...(roleArns.length > 0
            ? [
                {
                  Sid: "AllowRolesUse",
                  Effect: "Allow",
                  Principal: {
                    AWS: roleArns,
                  },
                  Action: ["kms:Decrypt", "kms:GenerateDataKey*"],
                  Resource: "*",
                },
              ]
            : []),
        ],
      }),
    );
  // Apply the key policy
  new aws.kms.KeyPolicy(
    `${options.config.environment}-viberator-ssm-key-policy`,
    {
      keyId: key.id,
      policy: keyPolicyDocument,
    },
  );
  // Create alias for easy reference
  new aws.kms.Alias(`${options.config.environment}-viberator-ssm-alias`, {
    name: aliasName,
    targetKeyId: key.id,
  });
  return {
    keyId: key.id,
    keyArn: key.arn,
    aliasName,
  };
}
//# sourceMappingURL=kms.js.map
