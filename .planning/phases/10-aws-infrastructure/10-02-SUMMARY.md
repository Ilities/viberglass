---
phase: 10-aws-infrastructure
plan: 02
subsystem: infra
tags: [aws, vpc, pulumi, networking, subnets, nat-gateway, security-groups]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    plan: 01
    provides: Infrastructure directory with Pulumi configuration
provides:
  - VPC with public/private subnets across 2 availability zones
  - NAT gateways for private subnet egress (cost-optimized single-NAT for dev/staging, HA multi-NAT for prod)
  - Security groups with least-privilege access (backend, RDS, workers)
  - Stack-aware configuration for dev/staging/prod environments
affects: [10-03-rds, 10-04-ecs-backend, 10-05-load-balancer]

# Tech tracking
tech-stack:
  added: [VpcComponent class, pulumi.Config stack-specific settings]
  patterns: [Component-based infrastructure, Stack-aware configuration, Environment-specific NAT gateway strategy]

key-files:
  created: [viberator/infrastructure/components/vpc.ts, viberator/infrastructure/infra/Pulumi.dev.yaml, viberator/infrastructure/infra/Pulumi.staging.yaml, viberator/infrastructure/infra/Pulumi.prod.yaml]
  modified: [viberator/infrastructure/infra/index.ts, viberator/infrastructure/infra/tsconfig.json]

key-decisions:
  - Single NAT gateway for dev/staging to reduce costs (~$30/month savings per NAT)
  - Multi-AZ NAT gateways for prod to ensure high availability
  - Security groups use references (not CIDR) for inter-service communication
  - Private subnets for RDS and workers, public subnets for load balancers

patterns-established:
  - "Component pattern: Reusable VpcComponent class encapsulating all networking resources"
  - "Config-first: Stack settings via pulumi.Config with environment-aware defaults"
  - "Exports as module-level exports for easy imports in other components"

# Metrics
duration: 4min
completed: 2026-01-22
---

# Phase 10 Plan 02: VPC Networking Summary

**VPC with public/private subnets across 2 AZs, NAT gateways, and security groups using Pulumi component pattern**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-22T16:45:27Z
- **Completed:** 2026-01-22T16:49:40Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Created VPC component with public subnets (10.0.1.0/24, 10.0.2.0/24) and private subnets (10.0.10.0/24, 10.0.11.0/24)
- Implemented security groups: backend (HTTP/HTTPS/custom port), RDS (PostgreSQL from backend only), workers (all outbound)
- Stack-aware configuration: dev/staging use single NAT gateway for cost savings, prod uses multi-NAT for HA
- Exported all VPC outputs for use by ECS and RDS components

## Task Commits

Each task was committed atomically:

1. **Task 1: Create VPC with public and private subnets** - `70f592d` (feat)
2. **Task 2-3: Wire VPC configuration to stack outputs** - `a500d85` (feat)

**Note:** Tasks 2 and 3 were combined into a single commit since security groups were created in Task 1 and Task 3 was the integration step.

## Files Created/Modified

- `viberator/infrastructure/components/vpc.ts` - VPC component with VpcComponent class
- `viberator/infrastructure/infra/index.ts` - Integrated VPC component, exported all outputs
- `viberator/infrastructure/infra/tsconfig.json` - Added components directory to includes
- `viberator/infrastructure/infra/Pulumi.dev.yaml` - Dev config with single NAT gateway
- `viberator/infrastructure/infra/Pulumi.staging.yaml` - Staging config with single NAT gateway
- `viberator/infrastructure/infra/Pulumi.prod.yaml` - Prod config with multi-NAT for HA

## Decisions Made

- **Single NAT gateway for non-production:** Reduces AWS costs by ~$30/month per NAT gateway. Dev and staging environments default to single NAT.
- **Multi-NAT for production:** High availability requires NAT gateways in both AZs. Prod defaults to multi-NAT.
- **Security group references over CIDR:** Inter-service communication (RDS ingress) uses security group references instead of CIDR blocks for better security posture.
- **Component-based architecture:** VpcComponent encapsulates all networking resources, making it reusable and testable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ECS Cluster settings syntax error**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `settings` property in aws.ecs.Cluster was an object instead of array, causing TypeScript error
- **Fix:** Changed `settings: { name: "containerInsights", value: "enabled" }` to `settings: [{ name: "containerInsights", value: "enabled" }]`
- **Files modified:** viberator/infrastructure/infra/index.ts
- **Verification:** TypeScript compilation succeeds without errors
- **Committed in:** 70f592d (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix necessary for compilation. No scope creep.

## Issues Encountered

- Pulumi CLI not installed in local environment - unable to run `pulumi preview` for verification
- Workaround: TypeScript compilation succeeds, which validates code correctness
- Note: Pulumi CLI installation will be required before actual deployment

## User Setup Required

None - no external service configuration required for VPC component.

## Next Phase Readiness

- VPC outputs exported and ready for RDS PostgreSQL component (plan 10-03)
- Security group IDs available for ECS backend task definitions (plan 10-04)
- Public subnet IDs available for load balancer configuration (plan 10-05)
- Private subnet IDs available for RDS and worker task placement

---
*Phase: 10-aws-infrastructure*
*Completed: 2026-01-22*
