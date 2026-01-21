# Phase 6: Clanker Static Status - Research

**Researched:** 2026-01-21
**Domain:** Cloud Resource Status Checking (AWS SDK v3, Dockerode)
**Confidence:** HIGH

## Summary

This phase implements STAT-01: "Platform displays clanker static status (resource exists, connected, ready)." Static status refers to checking whether the underlying compute resources for a clanker are properly configured and accessible, without actually invoking them.

The codebase already has the foundation in place:
- `WorkerInvoker` interface with `isAvailable()` method (DockerInvoker has real implementation, ECS/Lambda check client initialization)
- Three invoker types: `LambdaInvoker`, `EcsInvoker`, `DockerInvoker` with AWS SDK v3 and dockerode
- Clanker types and DAO with existing `status` field (`active`, `inactive`, `deploying`, `failed`)
- Frontend status display patterns from job polling (badge colors, status indicators)
- `usePolling` hook for auto-refresh with Page Visibility API support

**Primary recommendation:** Implement status checking service that queries AWS/Docker to verify resource existence, expose via new API endpoint, and display in frontend with appropriate visual indicators. Leverage existing `WorkerInvoker.isAvailable()` where possible.

## Standard Stack

The established libraries/tools for this domain:

### Core (Already in Codebase)
| Library | Purpose | Already Used In |
|---------|---------|-----------------|
| `@aws-sdk/client-ecs` | ECS cluster/task definition status | `EcsInvoker.ts` |
| `@aws-sdk/client-lambda` | Lambda function status | `LambdaInvoker.ts` |
| `dockerode` | Docker daemon/image status | `DockerInvoker.ts` |

### Supporting (Already in Codebase)
| Library | Purpose | Already Used In |
|---------|---------|-----------------|
| `@headlessui/react` | UI components | Frontend components |
| `motion/react` | Animations | `job-status-indicator.tsx` |
| `sonner` | Toast notifications | `useJobStatus.ts` |

### No New Dependencies Required
The existing stack is sufficient. All AWS SDK clients and dockerode are already installed and configured.

## Architecture Patterns

### Recommended Service Structure

```
platform/backend/src/
  services/
    ClankerHealthService.ts    # Main orchestrator
  api/routes/
    clankers.ts                # Add GET /:id/health endpoint
  workers/
    WorkerInvoker.ts           # Existing: has isAvailable()
    WorkerInvokerFactory.ts    # Existing: creates invokers
```

### Pattern 1: WorkerInvoker.isAvailable() (Already Exists)

**What:** Each invoker implements `isAvailable()` to check if the underlying service is accessible
**When to use:** For basic connectivity checks before attempting resource validation

**Current implementation status:**
```typescript
// Source: /platform/backend/src/workers/WorkerInvoker.ts
export interface WorkerInvoker {
  readonly name: string;
  invoke(job: JobData, clanker: Clanker): Promise<InvocationResult>;
  isAvailable(): Promise<boolean>;  // Already defined!
}
```

**Existing implementations:**
- `DockerInvoker.isAvailable()`: Calls `docker.ping()` - **fully implemented**
- `EcsInvoker.isAvailable()`: Checks `client !== undefined` - **basic check**
- `LambdaInvoker.isAvailable()`: Checks `client !== undefined` - **basic check**

### Pattern 2: Health Check Service (To Be Built)

**What:** Service that validates deployment config and checks deeper resource availability
**When to use:** When `isAvailable()` isn't enough (e.g., need to verify specific AWS resources exist)

```typescript
// Source: Derived from existing WorkerInvoker pattern
export interface ClankerHealthStatus {
  clankerId: string;
  isHealthy: boolean;
  status: 'healthy' | 'unhealthy' | 'unknown';
  checks: {
    resourceExists: boolean;        // Clanker record exists
    deploymentConfigured: boolean;  // Has strategy + config
    invokerAvailable: boolean;      // isAvailable() check
  };
  message?: string;
  lastChecked: string;
}

class ClankerHealthService {
  async checkClankerHealth(clanker: Clanker): Promise<ClankerHealthStatus> {
    // 1. Check deployment strategy exists
    // 2. Check deployment config is present and valid
    // 3. Get appropriate invoker from factory
    // 4. Call invoker.isAvailable()
    // 5. Optionally: Verify specific resources (cluster ARN, function name, etc.)
    // 6. Return aggregated status
  }
}
```

### Pattern 3: On-Demand Status Checking

**What:** Status checks triggered by API call, not continuously scheduled
**When to use:** When user views clanker detail or clicks refresh

```typescript
// API endpoint pattern
// GET /api/clankers/:id/health
router.get('/:id/health', validateUuidParam("id"), async (req, res) => {
  try {
    const clanker = await clankerService.getClanker(req.params.id);
    if (!clanker) {
      return res.status(404).json({ error: "Clanker not found" });
    }

    const health = await clankerHealthService.checkClankerHealth(clanker);
    res.json({ success: true, data: health });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

**Rationale:** For static status (existence checks), on-demand is sufficient. Background polling would add complexity without significant value - users primarily care about status when viewing a clanker.

### Pattern 4: Frontend Polling Hook (Optional Enhancement)

**What:** Use existing `usePolling` hook for periodic health refresh
**When to use:** If auto-refresh is desired (e.g., every 30-60 seconds)

```typescript
// Source: Existing usePolling pattern in useJobStatus.ts
export function useClankerHealth(clankerId: string) {
  return usePolling<ClankerHealthStatus>({
    fn: () => getClankerHealth(clankerId),
    interval: 30000, // Slower than job polling (3s)
    immediate: true,
    enabled: !!clankerId,
  });
}
```

### Anti-Patterns to Avoid

- **Continuous polling for static status:** Resource existence rarely changes; manual refresh is usually sufficient
- **Caching in database:** Resource status can become stale; always check live on request
- **Blocking clanker operations on status:** Status check failures shouldn't prevent other operations
- **Confusing stored status with health:** `clanker.status` (active/inactive) is deployment state; health is runtime availability

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker connectivity check | Custom socket ping | `DockerInvoker.isAvailable()` | Already calls `docker.ping()` |
| Polling with visibility handling | Custom useEffect logic | `usePolling` hook | Already handles Page Visibility API |
| Status badge colors | Custom color logic | Existing `Badge` component | Already has full color palette |
| Loading/refresh animation | CSS animations | `motion/react` (already used) | Consistent with job status indicator |
| AWS client initialization | Duplicate client code | `WorkerInvokerFactory` pattern | Centralized invoker creation |

**Key insight:** The `WorkerInvoker` interface already defines `isAvailable()` - DockerInvoker has a real implementation. Health checks should build on this foundation, adding deployment config validation and optional deeper resource checks.

## Common Pitfalls

### Pitfall 1: Confusing Static vs Dynamic Status
**What goes wrong:** Mixing up the stored `clanker.status` (active/inactive) with runtime health
**Why it happens:** Both represent "is it working?" but at different layers
**How to avoid:** Static status = deployment state stored in DB; Health status = runtime availability from invoker
**Warning signs:** Setting `clanker.status` based on health check results

### Pitfall 2: Conflating Static and Runtime Status
**What goes wrong:** Trying to check if a container is "running" in static status
**Why it happens:** Confusion about what "status" means
**How to avoid:** Static status = "can we invoke this?" (resources exist, configured correctly). Runtime status (Phase 7) = "is it currently executing?"
**Warning signs:** Checking ECS task running state instead of task definition existence

### Pitfall 3: Ignoring AWS Region Configuration
**What goes wrong:** Status checks fail because region doesn't match resource location
**Why it happens:** AWS SDK defaults may differ from clanker configuration
**How to avoid:** Extract region from ARN or deploymentConfig, pass to SDK client
**Warning signs:** "Resource not found" for resources that exist in AWS console

### Pitfall 4: Blocking UI on Status Fetch
**What goes wrong:** Page doesn't render until status check completes
**Why it happens:** Making status check part of initial data fetch
**How to avoid:** Fetch clanker first, then fetch status separately with loading state
**Warning signs:** Slow page loads when AWS calls take time

### Pitfall 5: Treating "Resource Not Found" as Error
**What goes wrong:** Throwing exceptions when AWS returns 404/ResourceNotFoundException
**Why it happens:** Natural to treat API errors as failures
**How to avoid:** Catch ResourceNotFoundException and return `{ exists: false }` - this is expected state for misconfigured clankers
**Warning signs:** Error toasts appearing when viewing unconfigured clankers

## Code Examples

Verified patterns from existing codebase:

### Health Check Response Type

```typescript
// Add to packages/types/src/clanker.ts
export interface ClankerHealthStatus {
  clankerId: string;
  isHealthy: boolean;
  status: 'healthy' | 'unhealthy' | 'unknown';
  checks: {
    resourceExists: boolean;        // Clanker record exists
    deploymentConfigured: boolean;  // Has strategy + config
    invokerAvailable: boolean;      // isAvailable() check
  };
  message?: string;
  lastChecked: string;              // ISO timestamp
}
```

### Health Service Pattern

```typescript
// Source: Based on WorkerInvokerFactory.getInvokerForClanker()
class ClankerHealthService {
  constructor(private invokerFactory: WorkerInvokerFactory) {}

  async checkClankerHealth(clanker: Clanker): Promise<ClankerHealthStatus> {
    const checks = {
      resourceExists: true,  // We found it in DB
      deploymentConfigured: false,
      invokerAvailable: false,
    };

    // Check deployment configuration
    if (!clanker.deploymentStrategy || !clanker.deploymentConfig) {
      return {
        clankerId: clanker.id,
        isHealthy: false,
        status: 'unhealthy',
        checks,
        message: 'Deployment strategy or configuration not set',
        lastChecked: new Date().toISOString(),
      };
    }
    checks.deploymentConfigured = true;

    // Check invoker availability
    try {
      const invoker = this.invokerFactory.getInvokerForClanker(clanker);
      checks.invokerAvailable = await invoker.isAvailable();
    } catch (error) {
      checks.invokerAvailable = false;
    }

    return {
      clankerId: clanker.id,
      isHealthy: checks.invokerAvailable,
      status: checks.invokerAvailable ? 'healthy' : 'unhealthy',
      checks,
      message: checks.invokerAvailable ? 'Clanker is ready' : 'Invoker unavailable',
      lastChecked: new Date().toISOString(),
    };
  }
}
```

### ECS: Check Cluster Exists (Optional Deep Check)

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeClustersCommand/
import { ECSClient, DescribeClustersCommand } from '@aws-sdk/client-ecs';

async function checkClusterExists(clusterArn: string): Promise<boolean> {
  const client = new ECSClient({ region: extractRegionFromArn(clusterArn) });

  try {
    const response = await client.send(new DescribeClustersCommand({
      clusters: [clusterArn],
    }));

    // Cluster found if it's in the clusters array with ACTIVE status
    const cluster = response.clusters?.[0];
    return cluster?.status === 'ACTIVE';
  } catch (error) {
    // ClusterNotFoundException means it doesn't exist
    if ((error as { name?: string }).name === 'ClusterNotFoundException') {
      return false;
    }
    throw error;
  }
}
```

### Lambda: Check Function Exists and Ready (Optional Deep Check)

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/lambda/command/GetFunctionCommand/
import { LambdaClient, GetFunctionCommand } from '@aws-sdk/client-lambda';

interface LambdaStatus {
  exists: boolean;
  ready: boolean;
  state?: string;
}

async function checkLambdaFunction(functionName: string, region?: string): Promise<LambdaStatus> {
  const client = new LambdaClient({ region: region || process.env.AWS_REGION });

  try {
    const response = await client.send(new GetFunctionCommand({
      FunctionName: functionName,
    }));

    const state = response.Configuration?.State;
    return {
      exists: true,
      ready: state === 'Active',
      state,
    };
  } catch (error) {
    if ((error as { name?: string }).name === 'ResourceNotFoundException') {
      return { exists: false, ready: false };
    }
    throw error;
  }
}
```

### Docker: Check Daemon and Image (Optional Deep Check)

```typescript
// Source: https://github.com/apocas/dockerode (existing pattern in DockerInvoker.ts)
import Docker from 'dockerode';

interface DockerStatus {
  daemonConnected: boolean;
  imageExists: boolean;
  imageName?: string;
}

async function checkDockerStatus(containerImage: string): Promise<DockerStatus> {
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });

  // Check daemon connectivity (DockerInvoker.isAvailable() does this)
  try {
    await docker.ping();
  } catch (error) {
    return { daemonConnected: false, imageExists: false };
  }

  // Check image exists locally
  try {
    const image = docker.getImage(containerImage);
    await image.inspect();
    return { daemonConnected: true, imageExists: true, imageName: containerImage };
  } catch (error) {
    // Image not found locally - this is expected, might need to pull
    return { daemonConnected: true, imageExists: false, imageName: containerImage };
  }
}
```

### Frontend: Health Badge Component

```typescript
// Source: Derived from existing job-status-indicator.tsx pattern
import { Badge } from '@/components/badge';
import { CheckCircleIcon, XCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/20/solid';

const healthConfig = {
  healthy: { label: 'Healthy', color: 'green' as const, icon: CheckCircleIcon },
  unhealthy: { label: 'Unhealthy', color: 'red' as const, icon: XCircleIcon },
  unknown: { label: 'Unknown', color: 'zinc' as const, icon: QuestionMarkCircleIcon },
};

export function ClankerHealthBadge({ health }: { health: ClankerHealthStatus }) {
  const { label, color, icon: Icon } = healthConfig[health.status];

  return (
    <Badge color={color}>
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Badge>
  );
}
```

### Frontend: Manual Refresh Pattern

```typescript
// Source: Derived from existing clanker-actions.tsx pattern
'use client';

import { Button } from '@/components/button';
import { ArrowPathIcon } from '@heroicons/react/16/solid';
import { useState } from 'react';

export function ClankerHealthRefresh({ clankerId }: { clankerId: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      // Trigger revalidation or call API directly
      await getClankerHealth(clankerId);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <Button plain disabled={isRefreshing} onClick={handleRefresh}>
      <ArrowPathIcon className={isRefreshing ? 'animate-spin' : ''} />
      Refresh
    </Button>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS SDK v2 | AWS SDK v3 | 2021 | Modular imports, better tree-shaking |
| Callback-based dockerode | Promise-based | Dockerode supports both | Cleaner async/await code |

**No deprecated patterns in use:** The codebase already uses AWS SDK v3 and modern async patterns.

## Open Questions

Things that couldn't be fully resolved:

1. **Should deep resource checks be done by default?**
   - What we know: `isAvailable()` provides basic connectivity; deep checks validate specific resources
   - What's unclear: Performance impact of always doing deep checks (DescribeClusters, GetFunction, etc.)
   - Recommendation: Start with `isAvailable()` + config validation; add deep checks optionally or via flag

2. **Should status be cached in database?**
   - What we know: Status can become stale; AWS/Docker state is authoritative
   - What's unclear: How frequently users check status; latency tolerance
   - Recommendation: Don't cache initially; add `statusCheckedAt` timestamp if latency becomes an issue

3. **Should frontend poll for health updates?**
   - What we know: `usePolling` hook exists with Page Visibility API
   - What's unclear: Whether health status changes frequently enough to warrant polling
   - Recommendation: Start with manual refresh; add optional polling if users request it

4. **What about Lambda functions deployed in different regions?**
   - What we know: Lambda ARNs contain region; deploymentConfig may specify region
   - What's unclear: Current clanker configs don't explicitly track region
   - Recommendation: Extract region from ARN if available, fall back to env var

5. **Should Docker image existence check attempt to pull?**
   - What we know: Image might not exist locally but be available on registry
   - What's unclear: Whether "image exists" means locally or anywhere
   - Recommendation: For static status, only check local; pulling is runtime concern

## Sources

### Primary (HIGH confidence)
- `/platform/backend/src/workers/WorkerInvoker.ts` - WorkerInvoker interface with `isAvailable()` method
- `/platform/backend/src/workers/invokers/DockerInvoker.ts` - Docker health check via `docker.ping()` (fully implemented)
- `/platform/backend/src/workers/invokers/EcsInvoker.ts` - ECS invoker structure
- `/platform/backend/src/workers/invokers/LambdaInvoker.ts` - Lambda invoker structure
- `/platform/backend/src/workers/WorkerInvokerFactory.ts` - Factory for getting invokers by strategy
- `/packages/types/src/clanker.ts` - Clanker type definitions
- `/platform/frontend/src/hooks/usePolling.ts` - Generic polling hook with Page Visibility API
- `/platform/frontend/src/hooks/useJobStatus.ts` - Job status polling pattern to follow
- `/platform/frontend/src/components/job-status-indicator.tsx` - Status indicator component pattern
- `/platform/backend/src/api/routes/clankers.ts` - Existing clanker API routes

### Secondary (MEDIUM confidence)
- `/platform/frontend/src/app/(app)/clankers/page.tsx` - Clanker list UI
- `/platform/frontend/src/app/(app)/clankers/[slug]/page.tsx` - Clanker detail UI
- `/platform/frontend/src/lib/formatters.ts` - Existing `formatClankerStatus()` function
- `/platform/frontend/src/components/badge.tsx` - Badge component with color variants
- AWS API Reference for ECS and Lambda (official docs)

### Tertiary (LOW confidence)
- None - all findings verified from codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already exists in codebase
- Architecture: HIGH - Follows existing patterns (WorkerInvoker, job status)
- Pitfalls: HIGH - Based on common AWS patterns and existing error handling
- Code examples: HIGH - Verified against existing codebase and official AWS SDK v3 docs

**Research date:** 2026-01-21
**Valid until:** 30 days (stable AWS SDK and dockerode APIs)

## Implementation Notes

### What Already Exists
- `ClankerStatus` type: `'active' | 'inactive' | 'deploying' | 'failed'`
- `status` and `statusMessage` fields in database
- Frontend `formatClankerStatus()` function with badge colors
- AWS SDK clients in invokers
- `WorkerInvoker.isAvailable()` method (DockerInvoker fully implemented, others basic)
- `usePolling` hook for frontend auto-refresh
- `Badge` component with full color palette
- `JobStatusIndicator` component pattern

### What Needs to Be Built
1. **Backend:** `ClankerHealthService` that orchestrates health checking
2. **Backend:** New API endpoint `GET /api/clankers/:id/health`
3. **Shared Types:** `ClankerHealthStatus` interface in `@viberator/types`
4. **Frontend:** Health badge component for clanker pages
5. **Frontend:** Optional `useClankerHealth` hook using `usePolling` pattern
6. **Frontend:** Manual refresh button with loading state

### File Locations
- Backend service: `/platform/backend/src/services/ClankerHealthService.ts` (NEW)
- Backend route: `/platform/backend/src/api/routes/clankers.ts` (MODIFY - add health endpoint)
- Types: `/packages/types/src/clanker.ts` (MODIFY - add ClankerHealthStatus)
- Frontend component: `/platform/frontend/src/components/clanker-health-badge.tsx` (NEW)
- Frontend hook: `/platform/frontend/src/hooks/useClankerHealth.ts` (NEW, optional)
- Frontend API: `/platform/frontend/src/service/api/clanker-api.ts` (MODIFY - add getClankerHealth)
