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
exports.createQueue = createQueue;
const aws = __importStar(require("@pulumi/aws"));
/**
 * Creates an SQS queue for worker job processing.
 *
 * The queue has a dead letter queue for failed messages
 * after the specified max receive count. This prevents
 * poison pill messages from blocking the queue indefinitely.
 */
function createQueue(options) {
  const visibilityTimeout = options.visibilityTimeoutSeconds ?? 900; // 15 minutes for Lambda max timeout
  const messageRetention = options.messageRetentionSeconds ?? 345600; // 4 days
  const maxReceiveCount = options.maxReceiveCount ?? 3;
  // Create dead letter queue for failed messages
  const deadLetterQueue = new aws.sqs.Queue(
    `${options.config.environment}-viberator-worker-dlq`,
    {
      visibilityTimeoutSeconds: visibilityTimeout,
      messageRetentionSeconds: messageRetention,
      tags: options.config.tags,
    },
  );
  // Create main worker queue with redrive policy for DLQ
  const queue = new aws.sqs.Queue(
    `${options.config.environment}-viberator-worker-queue`,
    {
      visibilityTimeoutSeconds: visibilityTimeout,
      messageRetentionSeconds: messageRetention,
      redrivePolicy: JSON.stringify({
        deadLetterTargetArn: deadLetterQueue.arn,
        maxReceiveCount: maxReceiveCount,
      }),
      tags: options.config.tags,
    },
  );
  return {
    queueUrl: queue.url,
    queueArn: queue.arn,
    queueId: queue.id,
    deadLetterQueueArn: deadLetterQueue.arn,
  };
}
//# sourceMappingURL=queue.js.map
