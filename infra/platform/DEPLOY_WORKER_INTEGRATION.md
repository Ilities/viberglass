# Deploy Worker Integration for Clanker ECS Provisioning

This guide walks through deploying the infrastructure changes that enable automatic ECS clanker provisioning by integrating the worker stack with the platform stack.

## What Changed

The platform backend now automatically receives worker infrastructure values (IAM roles, container image, cluster ARN) as environment variables. This allows the ClankerProvisioningService to automatically create ECS task definitions when you click "Start" on a clanker.

## Prerequisites

1. You have the worker infrastructure deployed:
   ```bash
   cd infra/workers
   pulumi stack ls
   # Should show your worker stack (e.g., viberglass-workers/prod)
   ```

2. Verify worker stack has required outputs:
   ```bash
   pulumi stack output ecsExecutionRoleArn
   pulumi stack output ecsTaskRoleArn
   pulumi stack output ecsImageUri
   pulumi stack output ecsClusterArn
   ```

## Deployment Steps

### Step 1: Update Pulumi Configuration

Edit your platform stack config file (e.g., `infra/platform/Pulumi.prod.yaml`):

```yaml
config:
  viberglass:baseStack: organization/viberglass-base/prod

  # Add this line with your worker stack name
  viberglass:workerStack: organization/viberglass-workers/prod
```

The format depends on your Pulumi backend:
- **S3 backend**: `organization/viberglass-workers/prod`
- **Local backend**: `viberglass-workers/prod`
- **Pulumi Cloud**: `org-name/viberglass-workers/prod`

To find your exact worker stack name:
```bash
cd infra/workers
pulumi stack ls
# Use the full name shown (including org prefix if any)
```

### Step 2: Preview the Changes

```bash
cd infra/platform
pulumi stack select prod  # or your environment
pulumi preview
```

Expected changes:
- **Backend task definition**: Updated with new environment variables
  - `VIBERATOR_ECS_EXECUTION_ROLE_ARN`
  - `VIBERATOR_ECS_TASK_ROLE_ARN`
  - `VIBERATOR_ECS_CONTAINER_IMAGE`
  - `VIBERATOR_ECS_CLUSTER_ARN`

The preview should show:
```
~ aws:ecs/taskDefinition:TaskDefinition: (update)
    [urn=...]
  ~ containerDefinitions: [
      ~ [0]: {
          ~ environment: [
              + [6]: {
                  + name : "VIBERATOR_ECS_EXECUTION_ROLE_ARN"
                  + value: "arn:aws:iam::123456:role/..."
                }
              + [7]: {
                  + name : "VIBERATOR_ECS_TASK_ROLE_ARN"
                  + value: "arn:aws:iam::123456:role/..."
                }
              + [8]: {
                  + name : "VIBERATOR_ECS_CONTAINER_IMAGE"
                  + value: "123456.dkr.ecr.eu-west-1..."
                }
              + [9]: {
                  + name : "VIBERATOR_ECS_CLUSTER_ARN"
                  + value: "arn:aws:ecs:eu-west-1:123456:cluster/..."
                }
            ]
        }
    ]
```

### Step 3: Deploy the Changes

```bash
pulumi up
# Review the changes and confirm with 'yes'
```

This will:
1. Register a new backend task definition revision with the worker environment variables
2. Update the backend ECS service to use the new task definition
3. Trigger a rolling deployment of backend tasks

### Step 4: Monitor the Deployment

```bash
# Watch the ECS service deployment
aws ecs describe-services \
  --cluster prod-viberglass-backend-cluster \
  --services prod-viberglass-backend \
  --region eu-west-1 \
  --query 'services[0].deployments'
```

Wait until:
- Only one deployment is shown (the new one)
- `runningCount` equals `desiredCount`
- `rolloutState` is `COMPLETED`

Or use Pulumi to wait:
```bash
pulumi stack output | grep serviceArn
# Then watch in AWS Console or CLI
```

### Step 5: Verify the Configuration

Check that environment variables are set:
```bash
aws ecs describe-task-definition \
  --task-definition prod-viberglass-backend \
  --region eu-west-1 \
  --query 'taskDefinition.containerDefinitions[0].environment[?starts_with(name, `VIBERATOR_ECS`)]'
```

Expected output:
```json
[
  {
    "name": "VIBERATOR_ECS_EXECUTION_ROLE_ARN",
    "value": "arn:aws:iam::123456:role/prod-viberglass-ecs-task-exec-role"
  },
  {
    "name": "VIBERATOR_ECS_TASK_ROLE_ARN",
    "value": "arn:aws:iam::123456:role/prod-viberglass-ecs-task-role"
  },
  {
    "name": "VIBERATOR_ECS_CONTAINER_IMAGE",
    "value": "123456.dkr.ecr.eu-west-1.amazonaws.com/prod-viberglass-worker-repo:..."
  },
  {
    "name": "VIBERATOR_ECS_CLUSTER_ARN",
    "value": "arn:aws:ecs:eu-west-1:123456:cluster/prod-viberglass-worker-cluster"
  }
]
```

### Step 6: Test Clanker Provisioning

1. Go to your Viberator platform UI
2. Navigate to Clankers page
3. Create a new clanker or select existing one with ECS deployment strategy
4. Click "Start"
5. Verify it succeeds (status changes to "active" or "deploying")

Check backend logs for provisioning messages:
```bash
aws logs tail /aws/ecs/prod-viberglass-backend \
  --follow \
  --filter-pattern "ClankerProvisioningService" \
  --region eu-west-1
```

## Rollback

If you need to rollback:

### Option 1: Revert Infrastructure Code
```bash
cd infra/platform
git revert <commit-hash>
pulumi up
```

### Option 2: Remove workerStack Config
```bash
# Edit Pulumi.prod.yaml and comment out:
# viberglass:workerStack: organization/viberglass-workers/prod

pulumi up
```

This will remove the worker environment variables from the backend task definition.

### Option 3: Rollback to Previous Task Definition
```bash
# List recent task definitions
aws ecs list-task-definitions \
  --family-prefix prod-viberglass-backend \
  --region eu-west-1 \
  --sort DESC \
  --max-items 5

# Update service to use previous revision
aws ecs update-service \
  --cluster prod-viberglass-backend-cluster \
  --service prod-viberglass-backend \
  --task-definition prod-viberglass-backend:PREVIOUS_REVISION \
  --region eu-west-1
```

## Troubleshooting

### Error: "Stack not found"

If you get an error about worker stack not found:
```
error: failed to load stack reference: stack not found: organization/viberglass-workers/prod
```

**Solutions:**
1. Verify the worker stack name:
   ```bash
   cd infra/workers
   pulumi stack ls
   ```
2. Use the exact name shown (case-sensitive)
3. Check you're using the correct Pulumi backend

### Error: "output not found"

If Pulumi can't find worker stack outputs:
```
error: failed to get output 'ecsExecutionRoleArn' from stack reference
```

**Solutions:**
1. Verify worker stack has been deployed:
   ```bash
   cd infra/workers
   pulumi stack output
   ```
2. If missing outputs, redeploy worker stack:
   ```bash
   pulumi up
   ```

### Backend tasks fail to start

If new backend tasks fail health checks:

1. Check CloudWatch logs:
   ```bash
   aws logs tail /aws/ecs/prod-viberglass-backend --follow
   ```

2. Check task definition is valid:
   ```bash
   aws ecs describe-task-definition \
     --task-definition prod-viberglass-backend
   ```

3. Verify environment variables are correctly formatted (no syntax errors)

### Clanker provisioning still fails

If clankers still can't provision after deployment:

1. Verify backend is using new task definition:
   ```bash
   aws ecs describe-services \
     --cluster prod-viberglass-backend-cluster \
     --services prod-viberglass-backend \
     --query 'services[0].taskDefinition'
   ```

2. Check backend logs for specific error:
   ```bash
   aws logs tail /aws/ecs/prod-viberglass-backend \
     --follow \
     --filter-pattern "ClankerProvisioningService"
   ```

3. Verify IAM permissions - backend task role needs:
   - `ecs:RegisterTaskDefinition`
   - `iam:PassRole` for worker execution and task roles

## Next Steps

After successful deployment:

1. **Update documentation**: Update any internal docs about clanker setup
2. **Test multiple agents**: Try provisioning clankers with different agent types
3. **Monitor costs**: Track ECS task costs in AWS Cost Explorer
4. **Consider auto-scaling**: Set up ECS auto-scaling for worker tasks if needed

## See Also

- [CLANKER_ECS_SETUP_FIX.md](../../docs/CLANKER_ECS_SETUP_FIX.md) - Original problem and all solution options
- [AWS_ECS_SETUP.md](../../docs/AWS_ECS_SETUP.md) - Manual ECS setup guide
- Worker infrastructure: `infra/workers/index.ts`
- Clanker provisioning service: `apps/platform-backend/src/services/ClankerProvisioningService.ts`
