# AWS ECS Clanker Setup

This guide walks you through deploying Viberator workers to AWS ECS Fargate. After completing these steps, you'll have a production-ready clanker that can process tickets using scalable cloud compute resources.

## Overview

**What this covers:**
- Creating ECR repository and pushing worker image
- Storing credentials in AWS SSM Parameter Store
- Creating ECS task definitions and cluster
- Configuring clanker to invoke ECS tasks
- End-to-end verification

**Architecture:**
```
Viberator Platform        AWS ECS              Fargate Task
     :                        :                      :
     |--- RunTask ----------->|                      |
     |   (ECS API)            |                      :
     |                        |--- Launch task ------>|
     |                        |                      |---> Container
     |                        |                      |     (ViberatorWorker)
     |<----- executionId -----|                      |          :
     :                        |                      :          |
     |                        |                      :          |
     |                        |                      |<--- Callback --->
     |<----- POST /result ----|<--------------------|<---------|
```

**Cost considerations:**
- Fargate pricing: ~$0.040/hour for 1 vCPU, 2GB (us-east-1)
- Per-job cost: Most tickets complete in 5-15 minutes
- Estimated cost: ~$0.01-$0.03 per ticket
- Use Fargate Spot for 70% savings (development/staging)

## Prerequisites

Before starting, ensure you have:

| Prerequisite | Check | Setup |
|--------------|-------|-------|
| **AWS CLI** | `aws --version` | `pip install awscli` or package manager |
| **AWS credentials** | `aws sts get-caller-identity` | `aws configure` or IAM role |
| **Docker** | `docker --version` | Docker Desktop or Engine |
| **ECR access** | `aws ecr describe-repositories` | IAM permissions required |
| **ECS access** | `aws ecs list-clusters` | IAM permissions required |
| **SSM access** | `aws ssm get-parameters-by-path` | IAM permissions required |
| **VPC** | `aws ec2 describe-vpcs` | Existing VPC with public subnets |

**Verify AWS access:**
```bash
aws sts get-caller-identity
# Should return your account ID, ARN, and user ID
```

## Required AWS Permissions

The Viberator platform needs these permissions to invoke ECS tasks:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:RunTask",
        "ecs:DescribeTasks",
        "ecs:DescribeTaskDefinition",
        "ecs:ListClusters"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/viberator/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/ecs/viberator-worker:*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:PassRole"],
      "Resource": [
        "arn:aws:iam::*:role/ecsTaskExecutionRole",
        "arn:aws:iam::*:role/viberatorWorkerTaskRole"
      ]
    }
  ]
}
```

Create an IAM policy with these permissions and attach to the platform's IAM role/user.

## Step 1: Create ECR Repository and Push Image

### 1.1 Create Repository

```bash
# Set your region and account ID
AWS_REGION="us-east-1"
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# Create ECR repository
aws ecr create-repository \
  --repository-name viberator-worker \
  --region $AWS_REGION

# Output includes repositoryUri - save it
REPO_URI="${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com/viberator-worker"
echo "Repository URI: $REPO_URI"
```

### 1.2 Login to ECR

```bash
aws ecr get-login-password \
  --region $AWS_REGION | \
  docker login \
  --username AWS \
  --password-stdin \
  ${AWS_ACCOUNT}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

### 1.3 Build and Push Image

```bash
# Build from repo root so the Dockerfile can access apps/viberator
cd /path/to/viberator

# Build image
docker build \
  -f infra/viberator/docker/viberator-docker-worker.Dockerfile \
  -t $REPO_URI:latest \
  .

# Push to ECR
docker push $REPO_URI:latest
```

**Verify:**
```bash
aws ecr describe-images \
  --repository-name viberator-worker \
  --region $AWS_REGION
```

## Step 2: Create ECS Task Execution Role

The task execution role allows ECS to pull images and write logs.

```bash
# Create trust policy file
cat > ecs-trust-policy.json <<'EOF'
{
  "Version": "2008-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role \
  --role-name viberatorWorkerExecutionRole \
  --assume-role-policy-document file://ecs-trust-policy.json

# Attach AmazonECSTaskExecutionRolePolicy (for ECR and CloudWatch)
aws iam attach-role-policy \
  --role-name viberatorWorkerExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Save the role ARN
EXECUTION_ROLE_ARN=$(aws iam get-role \
  --role-name viberatorWorkerExecutionRole \
  --query Role.Arn \
  --output text)

echo "Execution Role ARN: $EXECUTION_ROLE_ARN"
```

## Step 3: Create Task Role (Optional)

The task role allows the worker to access SSM parameters for credentials.

```bash
# Create the role
aws iam create-role \
  --role-name viberatorWorkerTaskRole \
  --assume-role-policy-document file://ecs-trust-policy.json

# Attach SSM read policy
aws iam attach-role-policy \
  --role-name viberatorWorkerTaskRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess

# Save the role ARN
TASK_ROLE_ARN=$(aws iam get-role \
  --role-name viberatorWorkerTaskRole \
  --query Role.Arn \
  --output text)

echo "Task Role ARN: $TASK_ROLE_ARN"
```

## Step 4: Store Credentials in SSM Parameter Store

Store GitHub token and Anthropic API key securely.

```bash
# Set your tenant ID (default is "api-server")
TENANT_ID="api-server"

# Store GitHub token
aws ssm put-parameter \
  --name "/viberator/tenants/${TENANT_ID}/GITHUB_TOKEN" \
  --value "ghp_your_github_token_here" \
  --type SecureString \
  --region $AWS_REGION

# Store Anthropic API key
aws ssm put-parameter \
  --name "/viberator/tenants/${TENANT_ID}/ANTHROPIC_API_KEY" \
  --value "sk-ant-your-anthropic-key-here" \
  --type SecureString \
  --region $AWS_REGION
```

**Verify:**
```bash
aws ssm get-parameter \
  --name "/viberator/tenants/${TENANT_ID}/GITHUB_TOKEN" \
  --with-decryption \
  --region $AWS_REGION
```

## Step 5: Create CloudWatch Log Group

```bash
aws logs create-log-group \
  --log-group-name /ecs/viberator-worker \
  --region $AWS_REGION

# Set retention (optional - 7 days shown)
aws logs put-retention-policy \
  --log-group-name /ecs/viberator-worker \
  --retention-in-days 7 \
  --region $AWS_REGION
```

## Step 6: Create ECS Task Definition

```bash
# Get your VPC configuration
# You'll need subnet IDs and security group ID from your VPC

# Create task definition file
cat > viberator-task-def.json <<EOF
{
  "family": "viberator-worker",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "$EXECUTION_ROLE_ARN",
  "taskRoleArn": "$TASK_ROLE_ARN",
  "containerDefinitions": [
    {
      "name": "worker",
      "image": "$REPO_URI:latest",
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/viberator-worker",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF

# Register task definition
TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://viberator-task-def.json \
  --region $AWS_REGION \
  --query taskDefinition.taskDefinitionArn \
  --output text)

echo "Task Definition ARN: $TASK_DEF_ARN"
```

**CPU/Memory guidelines:**
| CPU | Memory | Use Case |
|-----|--------|----------|
| 256 | 512 MB | Simple fixes, small repos |
| 512 | 1024 MB | Medium complexity |
| 1024 | 2048 MB | Default, most workloads |
| 2048 | 4096 MB | Large repos, complex agents |

## Step 7: Create ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name viberator-workers \
  --region $AWS_REGION

# Verify
aws ecs describe-clusters \
  --clusters viberator-workers \
  --region $AWS_REGION
```

## Step 8: Get VPC Configuration

```bash
# Get default VPC
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query Vpcs[0].VpcId \
  --output text)

echo "VPC ID: $VPC_ID"

# Get public subnets
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values=$VPC_ID Name=default-for-az,Values=true \
  --query Subnets[].SubnetId \
  --output text | tr '\t' ',')

echo "Subnet IDs: $SUBNET_IDS"

# Get default security group
SG_ID=$(aws ec2 describe-security-groups \
  --filters Name=vpc-id,Values=$VPC_ID Name=group-name,Values=default \
  --query SecurityGroups[0].GroupId \
  --output text)

echo "Security Group ID: $SG_ID"
```

**Note:** For production, create dedicated security groups with restrictive ingress/egress rules.

## Step 9: Configure Clanker in Platform

### 9.1 Create ECS Deployment Strategy

1. Navigate to **Clankers** page in the UI

2. Click **New Deployment Strategy** and create:
   - **Name:** `ECS Strategy`
   - **Type:** `ecs`
   - **Status:** `Active`

### 9.2 Create ECS Clanker

1. On the **Clankers** page, click **New Clanker**

2. Configure:
   - **Name:** `AWS ECS`
   - **Deployment Strategy:** Select the ECS strategy created above
   - **Status:** `Active`

3. **Deployment Config** (JSON):
   ```json
   {
     "clusterArn": "arn:aws:ecs:us-east-1:123456789012:cluster/viberator-workers",
     "taskDefinitionArn": "arn:aws:ecs:us-east-1:123456789012:task-definition/viberator-worker:1",
     "subnetIds": ["subnet-xxx", "subnet-yyy", "subnet-zzz"],
     "securityGroupIds": ["sg-xxx"],
     "launchType": "FARGATE",
     "assignPublicIp": "ENABLED"
   }
   ```

   Replace placeholder values with your actual AWS resources:
   - `clusterArn`: From Step 7
   - `taskDefinitionArn`: From Step 6
   - `subnetIds`: From Step 8
   - `securityGroupIds`: From Step 8

4. Click **Create**

**Launch type options:**
- `FARGATE`: Serverless, pay-per-use (recommended)
- `EC2`: Requires managing EC2 instances

## Step 10: Verify End-to-End

### 10.1 Create Test Ticket

1. Create a project with a repository URL
2. Create a ticket describing a bug or feature
3. Click "Run" and select the ECS clanker
4. Note the job ID

### 10.2 Monitor Task Execution

```bash
# Check if task is running
aws ecs list-tasks \
  --cluster viberator-workers \
  --region $AWS_REGION

# Describe task (replace <task-id>)
aws ecs describe-tasks \
  --cluster viberator-workers \
  --tasks <task-id> \
  --region $AWS_REGION
```

### 10.3 View CloudWatch Logs

```bash
# Tail logs (requires AWS CLI v2)
aws logs tail /ecs/viberator-worker --follow --region $AWS_REGION

# Or get specific log stream
aws logs describe-log-streams \
  --log-group-name /ecs/viberator-worker \
  --region $AWS_REGION

aws logs get-log-events \
  --log-group-name /ecs/viberator-worker \
  --log-stream-name <log-stream-name> \
  --region $AWS_REGION
```

### 10.4 Verify GitHub PR

Check the repository for a new pull request created by the worker.

## Troubleshooting

### Task Fails to Start

**Error:** `STOPPED (Essential container in task exited)` or `CannotPullContainerError`

**Solutions:**

1. **Check execution role has ECR permissions:**
   ```bash
   aws iam get-role-policy \
     --role-name viberatorWorkerExecutionRole \
     --policy-name AmazonECSTaskExecutionRolePolicy
   ```

2. **Verify task execution role is correct:**
   ```bash
   aws ecs describe-task-definition \
     --task-definition viberator-worker \
     --query taskDefinition.executionRoleArn
   ```

3. **Check CloudWatch logs for container errors:**
   ```bash
   aws logs tail /ecs/viberator-worker --follow
   ```

4. **Verify image exists in ECR:**
   ```bash
   aws ecr describe-images \
     --repository-name viberator-worker
   ```

---

### SSM Parameter Not Found

**Error:** `ParameterNotFound` in worker logs

**Solutions:**

1. **Verify parameter path matches tenant ID:**
   ```bash
   aws ssm get-parameters-by-path \
     --path "/viberator/tenants" \
     --recursive \
     --region $AWS_REGION
   ```

2. **Check parameter exists for your tenant:**
   ```bash
   aws ssm get-parameter \
     --name "/viberator/tenants/api-server/GITHUB_TOKEN" \
     --with-decryption
   ```

3. **Ensure task role has SSM read permissions:**
   ```bash
   aws iam list-attached-role-policies \
     --role-name viberatorWorkerTaskRole
   ```

---

### Callback Fails

**Error:** Worker completes but platform never updates, job stays in `running`

**Solutions:**

1. **Check task has internet access:**
   - Verify `assignPublicIp: "ENABLED"` in clanker config
   - Or configure NAT gateway for private subnets

2. **Check platform is reachable from task:**
   ```bash
   # Run a test task with curl
   aws ecs run-task \
     --cluster viberator-workers \
     --task-definition viberator-worker \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[<subnet>],assignPublicIp=ENABLED}" \
     --overrides '{
       "containerOverrides": [{
         "name": "worker",
         "command": ["curl", "-v", "https://your-platform.com/health"]
       }]}'
   ```

3. **Check worker logs for callback errors:**
   ```bash
   aws logs tail /ecs/viberator-worker --filter-pattern "callback" --follow
   ```

---

### Task Stuck in PENDING Status

**Error:** Task never starts, stays in `PENDING`

**Solutions:**

1. **Check for capacity issues:**
   ```bash
   aws ecs describe-clusters \
     --clusters viberator-workers \
     --query clusters[0].capacityProviders
   ```

2. **Verify subnet IDs are valid:**
   ```bash
   aws ec2 describe-subnets --subnet-ids <subnet-id-1> <subnet-id-2>
   ```

3. **Check security group allows outbound traffic:**
   ```bash
   aws ec2 describe-security-groups --group-ids <sg-id>
   ```

---

### Insufficient Permissions

**Error:** `User: arn:aws:iam::... is not authorized to perform: ecs:RunTask`

**Solution:** Attach required permissions (see "Required AWS Permissions" section) to the platform's IAM user/role.

---

## Cost Optimization

| Strategy | Savings | Tradeoff |
|----------|---------|----------|
| **Fargate Spot** | 70% | Tasks may be interrupted with 2-minute warning |
| **Right-size CPU/Memory** | 50%+ | Requires testing for optimal size |
| **Log retention** | Minor | Shorter retention = lower CloudWatch costs |
| **Clean up old tasks** | Minimal | Remove stopped task definitions |

**Enable Fargate Spot:**
```json
{
  "clusterArn": "...",
  "taskDefinitionArn": "...",
  "subnetIds": ["..."],
  "securityGroupIds": ["..."],
  "launchType": "FARGATE",
  "capacityProviderStrategy": [{
    "capacityProvider": "FARGATE_SPOT",
    "weight": 1,
    "base": 0
  }]
}
```

## Quick Reference

**Build and push image:**
```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker build -t 123456789.dkr.ecr.us-east-1.amazonaws.com/viberator-worker:latest .
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/viberator-worker:latest
```

**Update credentials:**
```bash
aws ssm put-parameter \
  --name "/viberator/tenants/api-server/GITHUB_TOKEN" \
  --value "ghp_new_token" \
  --type SecureString \
  --overwrite
```

**Check running tasks:**
```bash
aws ecs list-tasks --cluster viberator-workers
```

**View logs:**
```bash
aws logs tail /ecs/viberator-worker --follow
```

---

**Next steps:** See [LOCAL_DOCKER_SETUP.md](./LOCAL_DOCKER_SETUP.md) for local development guide.
