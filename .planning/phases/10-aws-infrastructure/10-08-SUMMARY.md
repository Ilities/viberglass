---
phase: 10-aws-infrastructure
plan: 08
subsystem: infra
tags: [s3, cloudfront, oac, static-hosting, spa, cdn]

# Dependency graph
requires:
  - phase: 10-aws-infrastructure
    plan: 10-01
    provides: ECR repository for container images
  - phase: 10-aws-infrastructure
    plan: 10-02
    provides: VPC networking with public/private subnets
  - phase: 10-aws-infrastructure
    plan: 10-06
    provides: Backend ECS service with ALB
provides:
  - S3 bucket for frontend static hosting with AES256 encryption
  - CloudFront distribution with Origin Access Control (OAC)
  - SPA routing support via custom error responses (403/404 -> index.html)
  - SSM parameters for API URL and CDN URL configuration
affects: [deployment, ci-cd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - S3+CloudFront static hosting with OAC
    - SSM parameter storage for build-time config
    - SPA routing via CloudFront custom error responses

key-files:
  created:
    - infrastructure/components/frontend.ts
  modified:
    - infrastructure/index.ts

key-decisions:
  - "Origin Access Control (OAC) instead of public S3 bucket for security"
  - "CloudFront PriceClass_100 for dev/staging, All for prod to optimize costs"
  - "Custom error responses for Next.js static export SPA routing"

patterns-established:
  - "Frontend hosting: S3 + CloudFront with OAC, no public bucket access"
  - "Build-time config: SSM parameters for NEXT_PUBLIC_ variables"

# Metrics
duration: 2min
completed: 2026-01-22
---

# Phase 10 Plan 08: Frontend S3+CloudFront Summary

**S3 bucket with CloudFront distribution for Next.js static export, using Origin Access Control for security and custom error responses for SPA routing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-22T19:36:52Z
- **Completed:** 2026-01-22T19:39:17Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Created `createFrontend()` component with S3 bucket and CloudFront distribution
- Implemented Origin Access Control (OAC) for secure S3 access without public bucket
- Configured custom error responses (403/404 -> index.html) for Next.js SPA routing
- Created SSM parameters for frontend API URL and CDN URL configuration
- Wired frontend component to main infrastructure stack

## Task Commits

Each task was committed atomically:

1. **Task 1: Create S3 bucket for frontend static hosting** - `5447373` (feat)
   - S3 bucket with AES256 encryption and block public access
   - CloudFront distribution with OAC
   - Custom error responses for SPA routing
   - SSM parameters for configuration

2. **Task 4: Wire frontend component to main stack** - `be487ff` (feat)
   - Import and create frontend with backend URL from load balancer
   - Environment-specific price class configuration
   - Export frontend outputs

## Files Created/Modified
- `infrastructure/components/frontend.ts` - Frontend hosting component (S3+CloudFront)
- `infrastructure/index.ts` - Main stack with frontend integration

## Decisions Made
- **Origin Access Control (OAC)**: Uses OAC instead of public S3 bucket for better security posture. S3 bucket blocks all public access; CloudFront is the only entry point.
- **Price class by environment**: `PriceClass_100` (North America/Europe) for dev/staging to reduce costs, `PriceClass_All` for production for global reach.
- **SPA routing via custom error responses**: CloudFront returns 200 with `/index.html` for 403/404 errors to support Next.js client-side routing.
- **viewerCertificate**: Supports optional ACM certificate for custom domains; uses CloudFront default certificate for MVP.

## Deployment Process

To deploy the frontend after `pulumi up`:

```bash
# 1. Build the frontend with API URL from stack output
cd platform/frontend
NEXT_PUBLIC_API_URL=$(pulumi stack output backendUrl) npm run build

# 2. Sync static files to S3
aws s3 sync out/ s3://$(pulumi stack output frontendBucketName) --delete

# 3. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id $(pulumi stack output frontendDistributionId) \
  --paths "/*"
```

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **TypeScript errors during initial component creation**:
  - `originAccessControlOrigin` -> `originAccessControlOriginType` (correct Pulumi type)
  - `regionalDomainName` -> `bucketRegionalDomainName` (correct BucketV2 property)
  - Duplicate `viewerProtocolPolicy` removed
  - `viewerCertificate` added as required property

All errors resolved by referencing Pulumi AWS provider types.

## Authentication Gates

None - no AWS CLI authentication required for this plan (infrastructure code only).

## Next Phase Readiness
- Frontend hosting infrastructure ready for deployment
- SSM parameters available for CI/CD to inject build-time variables
- Next step: Create deployment scripts or CI/CD pipeline (Phase 11)
- Pulumi CLI installation still required before actual deployment (blocker noted in STATE.md)

---
*Phase: 10-aws-infrastructure*
*Completed: 2026-01-22*
