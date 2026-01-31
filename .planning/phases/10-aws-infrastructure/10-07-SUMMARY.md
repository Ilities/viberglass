---
phase: 10-aws-infrastructure
plan: 07
subsystem: backend-ecs
tags: [ecs, fargate, alb, load-balancer, auto-scaling]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    plans: [01, 02, 03, 06]
    provides: VPC, ECR, database, logging components
provides:
  - ECS Fargate service for backend API
  - Application Load Balancer with HTTP/HTTPS listeners
  - Target group with health checks on /health endpoint
  - Auto-scaling based on CPU (70%) and memory (80%) metrics
  - Backend URL accessible via ALB DNS name
affects:
  - Frontend configuration (backendUrl export)
  - Deployment workflows (ECS service updates)
  - Monitoring and alerting (ALB metrics, ECS metrics)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Load balancer security group with bidirectional rules
    - Backend ECS service with health check integration
    - Target tracking auto-scaling policies
    - Environment-aware task sizing (CPU/memory per environment)

key-files:
  created:
    - infrastructure/components/load-balancer.ts
    - infrastructure/components/backend-ecs.ts
  modified:
    - infrastructure/components/vpc.ts
    - infrastructure/index.ts

key-decisions:
  - "HTTP-only ALB for MVP, HTTPS optional via ACM certificate ARN"
  - "Backend task uses port 3000, ALB target group uses port 80 (assumes SSL termination at ALB)"
  - "Reuse existing ECS cluster from worker component for cost efficiency"
  - "Health check on /health endpoint with 30s interval, 5s timeout"
  - "Auto-scaling: CPU 70%, Memory 80%, with 300s cooldown"

patterns-established:
  - "Load balancer component factory: createLoadBalancer() returns ALB DNS, target group, security group"
  - "Backend ECS split: createBackendEcs() for task definition, createBackendService() for service"
  - "Security group rules created bidirectionally for ALB-to-backend traffic"
  - "Environment-based defaults in main stack (cpu, memory, min/max tasks)"

# Metrics
duration: 4min
completed: 2026-01-22
---

# Phase 10 Plan 07: Backend ECS Service Summary

**ECS Fargate service with Application Load Balancer for backend API deployment**

## Performance

- **Duration:** 4 minutes, 12 seconds
- **Started:** 2026-01-22T19:29:04Z
- **Completed:** 2026-01-22T19:33:16Z
- **Tasks:** 4
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- Created Application Load Balancer component with security groups and target groups
- Created Backend ECS component with task definition and service
- Added vpcCidr export to VPC component for ALB security group rules
- Wired backend and load balancer components to main stack
- Configured auto-scaling policies based on CPU and memory metrics
- Exported backend URL, service ARN, and ALB outputs

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Application Load Balancer component** - `b99bded` (feat)
2. **Task 2: Create backend ECS task definition component** - `a56f4b5` (feat)
3. **Task 3: Add vpcCidr to VPC outputs** - `5be4e0e` (feat)
4. **Task 4: Wire backend components to main stack** - `785edb9` (feat)

## Files Created/Modified

### Created

- `infrastructure/components/load-balancer.ts` - ALB with security groups, target group, HTTP/HTTPS listeners
- `infrastructure/components/backend-ecs.ts` - ECS task definition and service for backend API

### Modified

- `infrastructure/components/vpc.ts` - Added vpcCidr to VpcOutputs interface and outputs()
- `infrastructure/index.ts` - Imported LB and backend components, wired up dependencies, exported outputs

## Decisions Made

1. **HTTP-only ALB for MVP**: The load balancer defaults to HTTP-only forwarding. HTTPS support is optional via `certificateArn` parameter. When certificate is provided, HTTP listener redirects to HTTPS.

2. **Port configuration**: Backend container uses port 3000 (from Dockerfile), ALB target group uses port 80. This assumes SSL termination at the ALB level when HTTPS is configured.

3. **ECS cluster reuse**: Backend service reuses the existing ECS cluster created for the worker component (`ecsWorker.clusterArn`). This is more cost-effective than creating a separate cluster.

4. **Environment-based sizing**: Task CPU and memory scale with environment:
   - Dev: 256 CPU / 512 MB memory, 1-3 tasks
   - Prod: 512 CPU / 1024 MB memory, 2-10 tasks

5. **Auto-scaling thresholds**: CPU scales out at 70%, memory at 80%, both with 300-second cooldown to prevent flapping.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Pulumi TargetGroupHealthCheck property names**
- **Found during:** Task 1 TypeScript compilation
- **Issue:** Pulumi AWS SDK uses `interval` not `intervalSeconds`, `timeout` not `timeoutSeconds`
- **Fix:** Updated healthCheck configuration to use correct property names
- **Files modified:** infrastructure/components/load-balancer.ts
- **Verification:** TypeScript compilation succeeds

**2. [Rule 3 - Blocking] Fixed missing vpcCidr export**
- **Found during:** Task 4 - wiring load balancer to main stack
- **Issue:** Load balancer component needs vpcCidr for security group rules, but VPC component didn't export it
- **Fix:** Added vpcCidr to VpcOutputs interface and outputs() method
- **Files modified:** infrastructure/components/vpc.ts, infrastructure/index.ts
- **Verification:** TypeScript compilation succeeds

**3. [Rule 3 - Blocking] Fixed ECS Service.arn property access**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** aws.ecs.Service doesn't have an `arn` property, use `id` instead
- **Fix:** Changed `backendService.arn` to `backendService.id`
- **Files modified:** infrastructure/components/backend-ecs.ts
- **Verification:** TypeScript compilation succeeds

---

**Total deviations:** 3 auto-fixed (2 blocking issues, 1 bug fix)
**Impact on plan:** All deviations were necessary fixes for correct operation. No scope creep.

## Issues Encountered

None - all tasks executed as planned after auto-fixes.

## Authentication Gates

None encountered during this plan execution.

## User Setup Required

### Optional: HTTPS Certificate

For production HTTPS support, add the ACM certificate ARN to the Pulumi stack configuration:

```bash
pulumi config set --stack dev backendCertificateArn arn:aws:acm:eu-west-1:123456789012:certificate/xxxxx
```

Then update `infrastructure/index.ts` to pass `certificateArn` to `createLoadBalancer()`.

### Dockerfile Requirements

The backend Dockerfile must:
- Expose port 3000
- Implement a `/health` endpoint returning HTTP 200
- Use `node:24-alpine` base image (or compatible)

The existing `platform/backend/Dockerfile` meets these requirements.

## Next Phase Readiness

- Backend ECS service ready for deployment
- ALB DNS name exported for frontend configuration
- Auto-scaling policies configured for production traffic
- Database credentials sourced from SSM Parameter Store
- S3 access attached for file upload functionality

Ready for frontend configuration to use `backendUrl` output.

---
*Phase: 10-aws-infrastructure*
*Plan: 07*
*Completed: 2026-01-22*
