# Connecting the Worker Stack to the Platform Stack

The platform backend provisions ECS and Lambda workers for agents with the worker stack's IAM roles, images, cluster and network. It gets them as environment variables, which the platform stack reads from the worker stack through a stack reference. Without that reference the platform stack warns during `pulumi up`, and agents using ECS or Lambda need their roles and images set by hand in their deployment config.

## Deployment Order

Deploy `infra/base`, then `infra/workers`, then `infra/platform`. The platform backend only receives the worker values during the platform `pulumi up`, so if you deployed the platform before the workers, run `pulumi up` in `infra/platform` again.

## Steps

### 1. Check the worker stack's outputs

```bash
cd infra/workers
pulumi stack ls        # note the full stack name
pulumi stack output ecsExecutionRoleArn
pulumi stack output ecsTaskRoleArn
pulumi stack output workerRepositoryUrl
pulumi stack output ecsClusterArn
pulumi stack output lambdaImageUri
pulumi stack output lambdaRoleArn
pulumi stack output workerSubnets
pulumi stack output workerSecurityGroup
```

### 2. Set `workerStack` in the platform config

In `infra/platform/Pulumi.<stack>.yaml` (copied from `Pulumi.<stack>.yaml.example`), uncomment and set:

```yaml
config:
  viberglass:baseStack: organization/viberglass-base/prod
  viberglass:workerStack: organization/viberglass-workers/prod
```

Use the full name `pulumi stack ls` shows. The format depends on your Pulumi backend:
- S3 or local backend: `organization/viberglass-workers/prod`
- Pulumi Cloud: `<org-name>/viberglass-workers/prod`

### 3. Deploy the platform stack

```bash
cd infra/platform
pulumi stack select prod
pulumi up
```

This registers a new revision of the backend task definition with these variables:

- `VIBERATOR_ECS_EXECUTION_ROLE_ARN`
- `VIBERATOR_ECS_TASK_ROLE_ARN`
- `VIBERATOR_ECS_CLUSTER_ARN`
- `VIBERATOR_ECS_SUBNET_IDS`
- `VIBERATOR_ECS_SECURITY_GROUP_IDS`
- `VIBERATOR_ECS_LOG_GROUP`
- `VIBERATOR_LAMBDA_IMAGE_URI`
- `VIBERATOR_LAMBDA_ROLE_ARN`
- `VIBERATOR_WORKER_REGISTRY` and `VIBERATOR_WORKER_IMAGE_TAG`, from `viberglass:workerImageRegistry` and `viberglass:workerImageTag`; with `workerImageRegistry: ecr` the registry is the host of `workerRepositoryUrl`

The backend service ignores task definition changes made by Pulumi. The backend deploy workflow (`deploy-backend-dev.yml` / `deploy-backend-prod.yml`) builds on the latest revision of the family, so run it after `pulumi up` to roll the new variables out.

### 4. Verify

```bash
aws ecs describe-task-definition \
  --task-definition prod-viberglass-backend \
  --region eu-west-1 \
  --query 'taskDefinition.containerDefinitions[0].environment[?starts_with(name, `VIBERATOR_`)]'
```

Then create or start an agent with the ECS deployment strategy under Settings → Agents. If it fails, the backend logs are in:

```bash
aws logs tail /ecs/viberglass-prod-backend --follow --region eu-west-1
```

## Troubleshooting

### "Stack not found"

```
error: failed to load stack reference: stack not found: organization/viberglass-workers/prod
```

Check the name with `pulumi stack ls` in `infra/workers` (it's case-sensitive) and that you're logged in to the same Pulumi backend.

### "output not found"

```
error: failed to get output 'ecsExecutionRoleArn' from stack reference
```

The worker stack hasn't been deployed, or was deployed before the output existed. Run `pulumi up` in `infra/workers`.

### Provisioning still fails

1. Check the backend service runs the new task definition revision:
   ```bash
   aws ecs describe-services \
     --cluster "$(cd infra/platform && pulumi stack output backendClusterName)" \
     --services prod-viberglass-backend \
     --query 'services[0].taskDefinition'
   ```
2. Look for the error in the backend logs (above).
3. The backend task role needs `ecs:RegisterTaskDefinition` and `iam:PassRole` for the worker execution and task roles. The platform stack adds `iam:PassRole` only when the worker roles are known, so it too depends on `workerStack`.

## Rolling Back

Comment out `viberglass:workerStack` and run `pulumi up` in `infra/platform`, then the backend deploy workflow. The variables are removed and agents need their ECS or Lambda settings in their own deployment config.

## See Also

- Worker infrastructure: `infra/workers/index.ts`
- Backend task definition: `infra/platform/components/backend-ecs.ts`
- Provisioning: `apps/platform-backend/src/services/ClankerProvisioningService.ts` and `apps/platform-backend/src/provisioning/`
