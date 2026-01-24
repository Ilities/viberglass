# Viberator Worker Architecture

## Overview

The Viberator platform uses **ephemeral workers** that process a single job and exit. This approach simplifies operations, improves resource utilization, and provides better isolation between jobs.

## Worker Types

### 1. Local Docker Worker
**Best for:** Development, testing, and on-premises deployments

- **Dockerfile:** `infra/viberator/docker/viberator-docker-worker.Dockerfile`
- **Build:** `npm run docker:build:local`
- **Runtime:** Runs a single job from CLI arguments and exits

```bash
# Run a job directly
docker run --rm \
  -e GITHUB_TOKEN=ghp_xxx \
  -e CLAUDE_CODE_API_KEY=sk-ant-xxx \
  viberator-worker:local \
  --job-data '{"id":"job-123","tenantId":"tenant-abc","repository":"https://github.com/user/repo","task":"Fix the bug"}'
```

### 2. AWS ECS Worker
**Best for:** Production workloads requiring longer execution times or more resources

- **Dockerfile:** `infra/viberator/docker/viberator-ecs-worker.Dockerfile`
- **Build:** `npm run docker:build:ecs`
- **Infrastructure:** Deployed via Pulumi (`infra/viberator/index.ts`)
- **Resources:** 2 vCPU, 4GB RAM (configurable)
- **Runtime:** Run via ECS RunTask API

```typescript
// Example: Run ECS task
const ecs = new ECS({ region: "us-east-1" });
await ecs.runTask({
  cluster: clusterName,
  taskDefinition: taskDefinitionArn,
  launchType: "FARGATE",
  networkConfiguration: {
    awsvpcConfiguration: {
      subnets: ["subnet-xxx"],
      assignPublicIp: "ENABLED",
    },
  },
  overrides: {
    containerOverrides: [{
      name: "viberator-worker",
      command: ["--job-data", JSON.stringify(jobData)],
    }],
  },
});
```

### 3. AWS Lambda Worker
**Best for:** Quick jobs under 15 minutes, event-driven processing

- **Dockerfile:** `infra/viberator/docker/viberator-lambda.Dockerfile`
- **Build:** `npm run docker:build:lambda`
- **Infrastructure:** Deployed via Pulumi
- **Resources:** Up to 2GB RAM, 15 min timeout
- **Trigger:** SQS queue

## Job Data Format

All workers accept the same job data structure:

```typescript
interface CodingJobData {
  id: string;                    // Unique job identifier
  tenantId: string;              // Tenant identifier for multi-tenancy
  repository: string;            // Git repository URL (HTTPS)
  task: string;                  // Task description
  branch?: string;               // Feature branch name (default: fix/{id})
  baseBranch?: string;           // Base branch (default: main)
  context?: {
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    stackTrace?: string;
    consoleErrors?: string[];
    affectedFiles?: string[];
  };
  settings?: {
    maxChanges?: number;         // Max file changes (default: 5)
    testRequired?: boolean;      // Require tests (default: false)
    codingStandards?: string;    // Coding standards to follow
    runTests?: boolean;          // Run tests (default: false)
    testCommand?: string;        // Test command (default: npm test)
    maxExecutionTime?: number;   // Max execution time in seconds
  };
  timestamp: number;             // Job creation timestamp
}
```

## Worker Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Orchestrator submits job with job data                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Worker container is invoked (Docker/ECS/Lambda)              │
│    - CLI args passed with --job-data or --job-file              │
│    - Credentials injected via environment or SSM                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Worker execution:                                             │
│    a. Initialize ViberatorWorker                                │
│    b. Clone repository to /tmp/viberator-work/{jobId}           │
│    c. Create feature branch                                     │
│    d. Execute AI agent (Claude Code, Qwen, etc.)                │
│    e. Commit changes and create PR                              │
│    f. Cleanup workspace                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Worker exits with status code:                                │
│    - 0 = Success                                                │
│    - 1 = Failure                                                │
│    - Result logged to stdout as JSON                            │
└─────────────────────────────────────────────────────────────────┘
```

## Credential Management

### Local/Docker
Credentials passed via environment variables:
```bash
docker run \
  -e GITHUB_TOKEN=ghp_xxx \
  -e CLAUDE_CODE_API_KEY=sk-ant-xxx \
  viberator-worker:local \
  --job-data '{...}'
```

### ECS
Credentials injected via SSM Parameter Store:
- Parameter: `/viberator/tenants/{tenantId}/GITHUB_TOKEN`
- Parameter: `/viberator/tenants/{tenantId}/CLAUDE_CODE_API_KEY`

### Lambda
Same as ECS - credentials fetched from SSM at runtime.

## Development

```bash
# Build all workers
npm run build

# Run CLI worker locally (with tsup watch)
npm run dev:worker -- --job-data '{"id":"test","tenantId":"local","repository":"https://github.com/user/repo","task":"Fix bug"}'

# Build Docker images
npm run docker:build:local
npm run docker:build:ecs
npm run docker:build:lambda

# Test with docker-compose
cd infra/viberator
docker-compose build worker
docker-compose run --rm worker \
  --job-data '{"id":"test","tenantId":"local","repository":"https://github.com/user/repo","task":"Fix bug"}'
```

## Deployment

### Local Docker
```bash
docker build -f infra/viberator/docker/viberator-docker-worker.Dockerfile -t viberator-worker:local .
docker run --rm viberator-worker:local --job-data '{...}'
```

### AWS ECS
```bash
cd infra/viberator
pulumi up
# Exported values: ecsClusterArn, ecsTaskDefinitionArn
```

### AWS Lambda
```bash
cd infra/viberator
pulumi up
# Automatically triggered from SQS queue
```

## Monitoring

- **Local Docker:** Check stdout logs and container exit code
- **ECS:** CloudWatch Logs (`/ecs/viberator-worker`)
- **Lambda:** CloudWatch Logs (Lambda log group)

## Troubleshooting

### Worker exits with code 1
Check the JSON result output for `errorMessage` field.

### Workspace not cleaned up
Workers use `/tmp/viberator-work` which is cleaned on exit. Check permissions if cleanup fails.

### Credentials not found
- Local: Verify environment variables are set
- ECS/Lambda: Verify SSM parameters exist at `/viberator/tenants/{tenantId}/`
