#!/bin/bash
# Script to add worker environment variables to the production backend task definition

set -e

ENVIRONMENT=${1:-prod}
AWS_REGION=${2:-eu-west-1}

echo "Adding worker environment variables to backend task definition..."

# Step 1: Get worker stack outputs
echo "Step 1: Getting worker infrastructure values..."
echo "Please run these commands to get your worker stack outputs:"
echo ""
echo "cd infra/workers"
echo "pulumi stack select <your-prod-stack>"
echo "pulumi stack output ecsExecutionRoleArn"
echo "pulumi stack output ecsTaskRoleArn"
echo "pulumi stack output ecsImageUri"
echo "pulumi stack output ecsClusterArn"
echo ""
echo "Then set them as environment variables:"
echo "export WORKER_EXECUTION_ROLE_ARN=<value>"
echo "export WORKER_TASK_ROLE_ARN=<value>"
echo "export WORKER_IMAGE_URI=<value>"
echo "export WORKER_CLUSTER_ARN=<value>"
echo ""

# Check if variables are set
if [ -z "$WORKER_EXECUTION_ROLE_ARN" ] || [ -z "$WORKER_TASK_ROLE_ARN" ] || [ -z "$WORKER_IMAGE_URI" ] || [ -z "$WORKER_CLUSTER_ARN" ]; then
  echo "Error: Please set the required environment variables first."
  exit 1
fi

# Step 2: Get current backend task definition
echo "Step 2: Getting current backend task definition..."
TASK_DEFINITION_NAME="${ENVIRONMENT}-viberglass-backend"
aws ecs describe-task-definition \
  --task-definition "$TASK_DEFINITION_NAME" \
  --region "$AWS_REGION" \
  --query 'taskDefinition' > current-task-def.json

# Step 3: Add worker environment variables
echo "Step 3: Adding worker environment variables to task definition..."
jq --arg exec_role "$WORKER_EXECUTION_ROLE_ARN" \
   --arg task_role "$WORKER_TASK_ROLE_ARN" \
   --arg image "$WORKER_IMAGE_URI" \
   --arg cluster "$WORKER_CLUSTER_ARN" \
   'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy) |
    .containerDefinitions[0].environment += [
      {name: "VIBERATOR_ECS_EXECUTION_ROLE_ARN", value: $exec_role},
      {name: "VIBERATOR_ECS_TASK_ROLE_ARN", value: $task_role},
      {name: "VIBERATOR_ECS_CONTAINER_IMAGE", value: $image},
      {name: "VIBERATOR_ECS_CLUSTER_ARN", value: $cluster}
    ]' current-task-def.json > updated-task-def.json

# Step 4: Register new task definition
echo "Step 4: Registering updated task definition..."
aws ecs register-task-definition \
  --cli-input-json file://updated-task-def.json \
  --region "$AWS_REGION" > registered-task-def.json

NEW_TASK_DEF_ARN=$(jq -r '.taskDefinition.taskDefinitionArn' registered-task-def.json)
echo "New task definition registered: $NEW_TASK_DEF_ARN"

# Step 5: Update the ECS service
echo "Step 5: Updating ECS service..."
ECS_CLUSTER="${ENVIRONMENT}-viberglass-backend-cluster"
ECS_SERVICE="${ENVIRONMENT}-viberglass-backend"

aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --region "$AWS_REGION" \
  --force-new-deployment

echo "✅ Backend task definition updated with worker environment variables"
echo ""
echo "The service will now redeploy with the new task definition."
echo "Monitor the deployment with:"
echo "aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION"
