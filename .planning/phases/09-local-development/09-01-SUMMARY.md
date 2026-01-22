---
phase: 09-local-development
plan: 01
subsystem: infra
tags: docker, development, hot-reload, monorepo, workspace

# Dependency graph
requires: []
provides:
  - Backend development Dockerfile with nodemon hot-reload
  - Frontend development Dockerfile with Next.js HMR
  - Docker build context configuration for monorepo workspaces
affects: [09-02-docker-compose, local-development-setup]

# Tech tracking
tech-stack:
  added: [node:20-alpine, Dockerfile.dev pattern]
  patterns: [workspace-aware Docker builds, monorepo container development]

key-files:
  created: [platform/backend/Dockerfile.dev, platform/frontend/Dockerfile.dev, platform/backend/.dockerignore, platform/frontend/.dockerignore]
  modified: []

key-decisions:
  - "Workspace-aware Docker builds: Build from monorepo root with proper package.json copying for dependency resolution"
  - "node:20-alpine base image: Matches project engines requirement, smaller image size"
  - "--legacy-peer-deps flag: Required for npm workspace compatibility during install"

patterns-established:
  - "Dockerfile.dev pattern: Separate development containers with hot-reload, distinct from production images"
  - "Monorepo build context: COPY from repository root, WORKDIR to specific package"
  - ".dockerignore standardization: Exclude node_modules, build artifacts, and local env files"

# Metrics
duration: 2min
completed: 2026-01-22
---

# Phase 9 Plan 1: Development Dockerfiles Summary

**Workspace-aware Dockerfiles for backend and frontend with nodemon/Next.js hot-reload on node:20-alpine**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-22T16:14:30Z
- **Completed:** 2026-01-22T16:16:30Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `platform/backend/Dockerfile.dev` with nodemon hot-reload support
- Created `platform/frontend/Dockerfile.dev` with Next.js HMR support
- Added `.dockerignore` files for both backend and frontend to optimize build context
- Configured workspace-aware builds that properly resolve monorepo dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Backend Dockerfile.dev** - `a76fb13` (feat)
2. **Task 2: Create Frontend Dockerfile.dev** - `a5bd1ff` (feat)
3. **Task 3: Create .dockerignore files** - (included in Tasks 1 and 2)

## Files Created/Modified

- `platform/backend/Dockerfile.dev` - Backend development container with nodemon hot-reload, builds from monorepo root
- `platform/backend/.dockerignore` - Excludes node_modules, dist, and build artifacts from backend build context
- `platform/frontend/Dockerfile.dev` - Frontend development container with Next.js HMR, builds from monorepo root
- `platform/frontend/.dockerignore` - Excludes node_modules, .next, and build artifacts from frontend build context

## Decisions Made

- **Workspace-aware Docker builds:** Initial attempt to build from individual package directories failed due to `@viberator/types` workspace dependency. Fixed by building from repository root with proper package.json copying for dependency resolution.
- **node:20-alpine base image:** Selected to match project's `engines.node` requirement and keep image sizes minimal.
- **--legacy-peer-deps flag:** Required for npm workspace compatibility during `npm install` in container.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed monorepo workspace dependency resolution**
- **Found during:** Task 1 (Backend Dockerfile.dev build)
- **Issue:** Initial Dockerfile built from `platform/backend/` context failed because `@viberator/types` workspace dependency couldn't be resolved
- **Fix:** Modified Dockerfile.dev to build from monorepo root, copying root package.json first, then backend package.json, running `npm install --legacy-peer-deps` from root
- **Files modified:** `platform/backend/Dockerfile.dev`, `platform/frontend/Dockerfile.dev`
- **Verification:** Both images build successfully with workspace dependencies resolved
- **Committed in:** `a76fb13` (backend), `a5bd1ff` (frontend)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary for monorepo architecture. No scope creep - images build successfully.

## Issues Encountered

- npm install initially failed with `@viberator/types@*` not found error because workspace packages weren't available during isolated build. Resolved by changing build context to repository root and copying workspace packages.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dockerfile.dev files ready for docker-compose integration (next plan: 09-02)
- Images can be built from repository root: `docker build -f platform/backend/Dockerfile.dev -t viberator-backend:dev .`
- Hot-reload will work when volumes are mounted via docker-compose

---
*Phase: 09-local-development*
*Completed: 2026-01-22*
