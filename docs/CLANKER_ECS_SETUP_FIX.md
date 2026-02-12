# Fix: Clanker ECS Provisioning Error

## Problem

When clicking "Start" on a clanker with ECS deployment strategy, you receive this error:

```json
{
  "error": "Failed to provision clanker resources",
  "message": "ECS task definition requires executionRoleArn, taskRoleArn, and containerImage"
}
```

## Root Cause

The backend's `ClankerProvisioningService` needs four environment variables to automatically provision ECS task definitions for clankers:

- `VIBERATOR_ECS_EXECUTION_ROLE_ARN` - IAM role for ECS to pull images and write logs
- `VIBERATOR_ECS_TASK_ROLE_ARN` - IAM role for worker tasks to access SSM parameters
- `VIBERATOR_ECS_CONTAINER_IMAGE` - Worker container image URI
- `VIBERATOR_ECS_CLUSTER_ARN` - ECS cluster ARN for running tasks

These values come from your worker infrastructure stack but aren't currently set in the backend environment.

## Solution Overview

There are two approaches:

1. **Quick Fix**: Manually update the backend task definition (immediate)
2. **Permanent Fix**: Update infrastructure code to reference worker stack (recommended for long-term)

---

## Option 1: Quick Fix (Manual)

### Step 1: Get Worker Stack Outputs

```bash
cd infra/workers
pulumi stack select <your-prod-stack>  # e.g., viberglass-workers/prod

# Get the required values
export WORKER_EXECUTION_ROLE_ARN=$(pulumi stack output ecsExecutionRoleArn)
export WORKER_TASK_ROLE_ARN=$(pulumi stack output ecsTaskRoleArn)
export WORKER_IMAGE_URI=$(pulumi stack output ecsImageUri)
export WORKER_CLUSTER_ARN=$(pulumi stack output ecsClusterArn)

# Verify they're set
echo "Execution Role: $WORKER_EXECUTION_ROLE_ARN"
echo "Task Role: $WORKER_TASK_ROLE_ARN"
echo "Image URI: $WORKER_IMAGE_URI"
echo "Cluster ARN: $WORKER_CLUSTER_ARN"
```

### Step 2: Update Backend Task Definition

```bash
cd /home/jussi/Development/viberator

# Make the script executable
chmod +x scripts/fix-production-worker-env.sh

# Run the script (requires AWS CLI configured)
./scripts/fix-production-worker-env.sh prod eu-west-1
```

The script will:
1. Fetch your current backend task definition
2. Add the four worker environment variables
3. Register a new task definition revision
4. Update the ECS service to use the new task definition
5. Force a new deployment

### Step 3: Wait for Deployment

```bash
# Monitor the deployment
aws ecs describe-services \
  --cluster prod-viberglass-backend-cluster \
  --services prod-viberglass-backend \
  --region eu-west-1 \
  --query 'services[0].deployments'
```

Wait until only one deployment is active and the service is stable.

### Step 4: Test

Go to your platform UI and try starting a clanker again. The error should be resolved.

---

## Option 2: Permanent Fix (Infrastructure Code)

This approach ensures the environment variables are always set correctly when deploying the backend.

### Step 1: Update Platform Config

Edit `infra/platform/config.ts`:

```typescript
export interface InfrastructureConfig {
  /** AWS region for resources */
  awsRegion: string;
  /** Environment name (dev, staging, prod) */
  environment: string;
  /** Base stack name for StackReference (e.g., "viberglass-base/dev") */
  baseStack: string;
  /** Worker stack name for StackReference (e.g., "viberglass-workers/dev") */
  workerStack?: string;  // ADD THIS LINE
  // ... rest of config
}
```

And update the `getConfig()` function:

```typescript
export function getConfig(): InfrastructureConfig {
  const config = new pulumi.Config();

  const awsRegion = config.require("awsRegion");
  const environment = config.require("environment");
  const baseStack = config.require("baseStack");
  const workerStack = config.get("workerStack");  // ADD THIS LINE

  // ... rest of function

  return {
    awsRegion,
    environment,
    baseStack,
    workerStack,  // ADD THIS LINE
    // ... rest of return
  };
}
```

### Step 2: Update Pulumi Stack Config

Edit your production stack config file (e.g., `Pulumi.prod.yaml`):

```yaml
config:
  viberglass-platform:awsRegion: eu-west-1
  viberglass-platform:environment: prod
  viberglass-platform:baseStack: viberglass-base/prod
  viberglass-platform:workerStack: viberglass-workers/prod  # ADD THIS LINE
  # ... rest of config
```

### Step 3: Update Platform Index

Edit `infra/platform/index.ts` to reference the worker stack:

```typescript
// After the baseStack reference (around line 56), add:

// Reference the worker stack for worker infrastructure values
let workerExecutionRoleArn: pulumi.Output<string> | undefined;
let workerTaskRoleArn: pulumi.Output<string> | undefined;
let workerImageUri: pulumi.Output<string> | undefined;
let workerClusterArn: pulumi.Output<string> | undefined;

if (config.workerStack) {
  const workerStack = new pulumi.StackReference(config.workerStack);
  workerExecutionRoleArn = workerStack.getOutput("ecsExecutionRoleArn") as pulumi.Output<string>;
  workerTaskRoleArn = workerStack.getOutput("ecsTaskRoleArn") as pulumi.Output<string>;
  workerImageUri = workerStack.getOutput("ecsImageUri") as pulumi.Output<string>;
  workerClusterArn = workerStack.getOutput("ecsClusterArn") as pulumi.Output<string>;
}
```

### Step 4: Update Backend ECS Component

Edit `infra/platform/components/backend-ecs.ts`:

Add to the `BackendEcsOptions` interface (around line 10):

```typescript
export interface BackendEcsOptions {
  /** Configuration loaded from Pulumi stack */
  config: InfrastructureConfig;
  // ... existing fields ...

  /** Worker infrastructure values (optional) */
  worker?: {
    executionRoleArn?: pulumi.Input<string>;
    taskRoleArn?: pulumi.Input<string>;
    imageUri?: pulumi.Input<string>;
    clusterArn?: pulumi.Input<string>;
  };
}
```

Update the `createBackendEcs` function to include worker env vars (around line 273):

```typescript
environment: [
  { name: "NODE_ENV", value: "production" },
  { name: "PORT", value: containerPort.toString() },
  { name: "AWS_REGION", value: options.config.awsRegion },
  { name: "DB_SSL", value: "true" },
  { name: "RUN_MIGRATIONS_ON_STARTUP", value: "true" },
  {
    name: "ALLOWED_ORIGINS",
    value: allowedOrigins,
  },
  // ADD THESE LINES:
  ...(options.worker?.executionRoleArn
    ? [{ name: "VIBERATOR_ECS_EXECUTION_ROLE_ARN", value: options.worker.executionRoleArn }]
    : []),
  ...(options.worker?.taskRoleArn
    ? [{ name: "VIBERATOR_ECS_TASK_ROLE_ARN", value: options.worker.taskRoleArn }]
    : []),
  ...(options.worker?.imageUri
    ? [{ name: "VIBERATOR_ECS_CONTAINER_IMAGE", value: options.worker.imageUri }]
    : []),
  ...(options.worker?.clusterArn
    ? [{ name: "VIBERATOR_ECS_CLUSTER_ARN", value: options.worker.clusterArn }]
    : []),
],
```

However, since these need to be Output types and the environment array needs plain values, we need a different approach. Update the containerDefinitions to use `pulumi.all()`:

Replace the `containerDefinitions` section (around line 246):

```typescript
containerDefinitions: pulumi
  .all([
    backendImage.imageUri,
    options.logGroupName,
    options.databaseSsm.urlPathArn,
    options.allowedOrigins ?? "http://localhost:3000",
    options.worker?.executionRoleArn ?? "",
    options.worker?.taskRoleArn ?? "",
    options.worker?.imageUri ?? "",
    options.worker?.clusterArn ?? "",
  ])
  .apply(([
    imageUri,
    logGroupName,
    databaseUrlPath,
    allowedOrigins,
    workerExecRole,
    workerTaskRole,
    workerImage,
    workerCluster,
  ]) => {
    const envVars = [
      { name: "NODE_ENV", value: "production" },
      { name: "PORT", value: containerPort.toString() },
      { name: "AWS_REGION", value: options.config.awsRegion },
      { name: "DB_SSL", value: "true" },
      { name: "RUN_MIGRATIONS_ON_STARTUP", value: "true" },
      { name: "ALLOWED_ORIGINS", value: allowedOrigins },
    ];

    // Add worker env vars if provided
    if (workerExecRole) {
      envVars.push({ name: "VIBERATOR_ECS_EXECUTION_ROLE_ARN", value: workerExecRole });
    }
    if (workerTaskRole) {
      envVars.push({ name: "VIBERATOR_ECS_TASK_ROLE_ARN", value: workerTaskRole });
    }
    if (workerImage) {
      envVars.push({ name: "VIBERATOR_ECS_CONTAINER_IMAGE", value: workerImage });
    }
    if (workerCluster) {
      envVars.push({ name: "VIBERATOR_ECS_CLUSTER_ARN", value: workerCluster });
    }

    return JSON.stringify([
      {
        name: "viberglass-backend",
        image: imageUri,
        essential: true,
        portMappings: [
          {
            containerPort: containerPort,
            protocol: "tcp",
          },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": logGroupName,
            "awslogs-region": options.config.awsRegion,
            "awslogs-stream-prefix": "backend",
          },
        },
        environment: envVars,
        secrets: [
          {
            name: "DATABASE_URL",
            valueFrom: databaseUrlPath,
          },
        ],
        healthCheck: {
          command: [
            "CMD-SHELL",
            `curl -f http://localhost:${containerPort}/health || exit 1`,
          ],
          interval: 30,
          timeout: 5,
          retries: 3,
          startPeriod: 60,
        },
      },
    ]);
  }),
```

### Step 5: Pass Worker Values When Creating Backend

In `infra/platform/index.ts`, update the `createBackendEcs` call (around line 190):

```typescript
const backendEcs: BackendEcsOutputs = createBackendEcs({
  config,
  repositoryUrl: registry.repositoryUrl,
  logGroupName: backendLogGroupName,
  targetGroupArn: loadBalancer.targetGroupArn,
  subnetIds: backendSubnetIds,
  backendSecurityGroupId: backendSecurityGroupId,
  albSecurityGroupId: loadBalancer.albSecurityGroupId,
  databaseSsm: {
    urlPathArn: database.urlPathArn,
    hostPathArn: database.hostPathArn,
  },
  cpu: backendCpu,
  memory: backendMemory,
  desiredCount: backendDesiredCount,
  minTasks: backendMinTasks,
  maxTasks: backendMaxTasks,
  assignPublicIp: backendAssignPublicIp,
  allowedOrigins: config.appDomain
    ? pulumi.interpolate`https://${config.appDomain}`
    : pulumi.interpolate`https://${amplifyFrontend.defaultDomain}`,
  // ADD THIS:
  worker: {
    executionRoleArn: workerExecutionRoleArn,
    taskRoleArn: workerTaskRoleArn,
    imageUri: workerImageUri,
    clusterArn: workerClusterArn,
  },
});
```

### Step 6: Deploy Updated Infrastructure

```bash
cd infra/platform
pulumi up
```

Review the changes and confirm. Pulumi will update the backend task definition with the worker environment variables.

---

## Verification

After applying either fix:

1. **Check Backend Task Definition**:
   ```bash
   aws ecs describe-task-definition \
     --task-definition prod-viberglass-backend \
     --query 'taskDefinition.containerDefinitions[0].environment' \
     --region eu-west-1
   ```

   You should see the four `VIBERATOR_ECS_*` environment variables.

2. **Test Clanker Start**:
   - Go to Clankers page in UI
   - Create or select an ECS clanker
   - Click "Start"
   - Should succeed and show status as "active" or "deploying"

3. **Check Backend Logs**:
   ```bash
   aws logs tail /aws/ecs/prod-viberglass-backend --follow --region eu-west-1
   ```

   Look for successful clanker provisioning messages.

---

## Alternative: Manual Clanker Configuration

If you prefer not to use automatic provisioning, you can manually configure each clanker's deployment config:

1. Get your worker task definition ARN:
   ```bash
   pulumi stack output ecsTaskDefinitionArn
   ```

2. When creating a clanker, set the deploymentConfig JSON:
   ```json
   {
     "taskDefinitionArn": "arn:aws:ecs:eu-west-1:123456:task-definition/prod-viberglass-worker:1",
     "clusterArn": "arn:aws:ecs:eu-west-1:123456:cluster/prod-viberglass-worker-cluster"
   }
   ```

This bypasses the automatic task definition creation and uses your pre-configured worker task definition directly.

---

## Troubleshooting

### Error persists after applying fix

1. Verify environment variables are set:
   ```bash
   aws ecs describe-task-definition \
     --task-definition prod-viberglass-backend \
     --query 'taskDefinition.containerDefinitions[0].environment'
   ```

2. Check if the backend service is using the latest task definition:
   ```bash
   aws ecs describe-services \
     --cluster prod-viberglass-backend-cluster \
     --services prod-viberglass-backend \
     --query 'services[0].taskDefinition'
   ```

3. Force a new deployment if needed:
   ```bash
   aws ecs update-service \
     --cluster prod-viberglass-backend-cluster \
     --service prod-viberglass-backend \
     --force-new-deployment
   ```

### Permission errors

Ensure the backend's task role has permissions to:
- Create ECS task definitions (`ecs:RegisterTaskDefinition`)
- Pass IAM roles (`iam:PassRole`)

### Image not found

Verify the worker image exists:
```bash
aws ecr describe-images \
  --repository-name <worker-repo-name> \
  --region eu-west-1
```

If missing, build and push the worker image:
```bash
cd infra/workers
pulumi up  # This should build and push the image
```

---

## References

- Worker Infrastructure: `infra/workers/index.ts`
- Clanker Provisioning Service: `apps/platform-backend/src/services/ClankerProvisioningService.ts`
- Backend Infrastructure: `infra/platform/components/backend-ecs.ts`
- ECS Setup Guide: `docs/AWS_ECS_SETUP.md`
