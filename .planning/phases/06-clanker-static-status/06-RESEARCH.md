# Phase 6: Clanker Static Status - Research

**Researched:** 2026-01-21
**Domain:** Cloud Resource Status Checking (AWS SDK v3, Dockerode)
**Confidence:** HIGH

## Summary

This phase implements STAT-01: "Platform displays clanker static status (resource exists, connected, ready)." Static status refers to checking whether the underlying compute resources for a clanker are properly configured and accessible, without actually invoking them.

The codebase already has the foundation in place:
- `WorkerInvoker` interface with `isAvailable()` method (currently stub implementations)
- Three invoker types: `LambdaInvoker`, `EcsInvoker`, `DockerInvoker` with AWS SDK v3 and dockerode
- Clanker types and DAO with existing `status` field (`active`, `inactive`, `deploying`, `failed`)
- Frontend status display patterns from job polling (badge colors, status indicators)

**Primary recommendation:** Implement status checking service that queries AWS/Docker to verify resource existence, expose via new API endpoint, and display in frontend with appropriate visual indicators.

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
    status/
      ClankerStatusService.ts    # Main orchestrator
      checkers/
        DockerStatusChecker.ts   # Docker-specific checks
        EcsStatusChecker.ts      # ECS-specific checks
        LambdaStatusChecker.ts   # Lambda-specific checks
        index.ts                 # Factory/exports
```

### Pattern 1: Status Checker Interface

**What:** Unified interface for all deployment strategy status checks
**When to use:** Each deployment strategy implements this interface

```typescript
// Source: Derived from existing WorkerInvoker pattern
export interface ResourceStatus {
  exists: boolean;
  connected: boolean;
  ready: boolean;
  details?: {
    message?: string;
    lastChecked: string;
    resourceId?: string;
  };
}

export interface ClankerStatusChecker {
  /**
   * Check if the underlying resource exists and is accessible
   */
  checkStatus(clanker: Clanker): Promise<ResourceStatus>;
}
```

### Pattern 2: On-Demand Status Checking

**What:** Status checks triggered by API call, not scheduled
**When to use:** When user views clanker detail or clicks refresh

```typescript
// API endpoint pattern
// GET /api/clankers/:id/status
router.get('/:id/status', async (req, res) => {
  const clanker = await clankerDAO.getClanker(req.params.id);
  const status = await statusService.checkStatus(clanker);
  res.json({ success: true, data: status });
});
```

**Rationale:** For static status (existence checks), on-demand is sufficient. Background polling would add complexity without significant value - users primarily care about status when viewing a clanker.

### Pattern 3: Cached Status with Manual Refresh

**What:** Display last known status, allow manual refresh button
**When to use:** Frontend clanker detail view

```typescript
// Frontend pattern
const [status, setStatus] = useState<ResourceStatus | null>(null);
const [isRefreshing, setIsRefreshing] = useState(false);

async function refreshStatus() {
  setIsRefreshing(true);
  const newStatus = await getClankerStatus(clankerId);
  setStatus(newStatus);
  setIsRefreshing(false);
}
```

### Anti-Patterns to Avoid

- **Polling status continuously:** Static resource existence rarely changes; don't waste API calls
- **Caching in database:** Resource status can become stale; always check live on request
- **Blocking clanker operations on status:** Status check failures shouldn't prevent other operations

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Docker connectivity check | Custom socket ping | `docker.ping()` | Handles all connection errors properly |
| ECS resource verification | Parse ARNs manually | `DescribeClustersCommand`, `DescribeTaskDefinitionCommand` | AWS SDK handles auth, retries, errors |
| Lambda function check | Parse function names | `GetFunctionCommand` | Returns function state and configuration |
| Status badge colors | Custom color logic | Existing `Badge` component with color prop | Already has full color palette |
| Loading/refresh animation | CSS animations | `motion/react` (already used) | Consistent with job status indicator |

**Key insight:** The existing invoker classes already have AWS clients initialized. Status checkers can reuse these clients or follow the same initialization pattern.

## Common Pitfalls

### Pitfall 1: Treating "Resource Not Found" as Error
**What goes wrong:** Throwing exceptions when AWS returns 404/ResourceNotFoundException
**Why it happens:** Natural to treat API errors as failures
**How to avoid:** Catch ResourceNotFoundException and return `{ exists: false }` - this is expected state for misconfigured clankers
**Warning signs:** Error toasts appearing when viewing unconfigured clankers

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

## Code Examples

Verified patterns from official sources:

### ECS: Check Cluster Exists

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

### ECS: Check Task Definition Exists

```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeTaskDefinitionCommand/
import { ECSClient, DescribeTaskDefinitionCommand } from '@aws-sdk/client-ecs';

async function checkTaskDefinitionExists(taskDefArn: string): Promise<boolean> {
  const client = new ECSClient({ region: extractRegionFromArn(taskDefArn) });

  try {
    const response = await client.send(new DescribeTaskDefinitionCommand({
      taskDefinition: taskDefArn,
    }));

    // Task definition found if status is ACTIVE
    return response.taskDefinition?.status === 'ACTIVE';
  } catch (error) {
    if ((error as { name?: string }).name === 'ClientException') {
      return false;
    }
    throw error;
  }
}
```

### Lambda: Check Function Exists and Ready

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

### Docker: Check Daemon and Image

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

  // Check daemon connectivity
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

### Frontend: Status Display Component

```typescript
// Source: Derived from existing job-status-indicator.tsx pattern
import { Badge } from '@/components/badge';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon } from '@heroicons/react/20/solid';

type ClankerResourceStatus = 'ready' | 'partial' | 'unavailable' | 'checking';

const statusConfig = {
  ready: { label: 'Ready', color: 'green' as const, icon: CheckCircleIcon },
  partial: { label: 'Partial', color: 'yellow' as const, icon: ExclamationCircleIcon },
  unavailable: { label: 'Unavailable', color: 'red' as const, icon: XCircleIcon },
  checking: { label: 'Checking...', color: 'zinc' as const, icon: null },
};

export function ClankerResourceStatus({ status }: { status: ClankerResourceStatus }) {
  const { label, color, icon: Icon } = statusConfig[status];
  return (
    <Badge color={color}>
      {Icon && <Icon className="h-4 w-4 mr-1" />}
      {label}
    </Badge>
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

1. **Should status be cached in database?**
   - What we know: Status can become stale; AWS/Docker state is authoritative
   - What's unclear: How frequently users check status; latency tolerance
   - Recommendation: Don't cache initially; add `statusCheckedAt` timestamp if latency becomes an issue

2. **What about Lambda functions deployed in different regions?**
   - What we know: Lambda ARNs contain region; deploymentConfig may specify region
   - What's unclear: Current clanker configs don't explicitly track region
   - Recommendation: Extract region from ARN if available, fall back to env var

3. **Should Docker image existence check attempt to pull?**
   - What we know: Image might not exist locally but be available on registry
   - What's unclear: Whether "image exists" means locally or anywhere
   - Recommendation: For static status, only check local; pulling is runtime concern

## Sources

### Primary (HIGH confidence)
- AWS SDK v3 ECS Client documentation - DescribeClustersCommand, DescribeTaskDefinitionCommand
- AWS SDK v3 Lambda Client documentation - GetFunctionCommand
- Dockerode GitHub repository - ping(), getImage(), inspect() methods
- Existing codebase: `LambdaInvoker.ts`, `EcsInvoker.ts`, `DockerInvoker.ts`

### Secondary (MEDIUM confidence)
- AWS API Reference for ECS and Lambda (official docs)
- Existing frontend patterns: `job-status-indicator.tsx`, `Badge` component

### Tertiary (LOW confidence)
- None - all findings verified against official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Already exists in codebase
- Architecture: HIGH - Follows existing patterns (WorkerInvoker, job status)
- Pitfalls: MEDIUM - Based on common AWS patterns and existing error handling
- Code examples: HIGH - Verified against official AWS SDK v3 and dockerode docs

**Research date:** 2026-01-21
**Valid until:** 30 days (stable AWS SDK and dockerode APIs)

## Implementation Notes

### What Already Exists
- `ClankerStatus` type: `'active' | 'inactive' | 'deploying' | 'failed'`
- `status` and `statusMessage` fields in database
- Frontend `formatClankerStatus()` function with badge colors
- AWS SDK clients in invokers
- `WorkerInvoker.isAvailable()` method (currently stub)

### What Needs to Be Built
1. **Backend:** `ClankerStatusService` that orchestrates status checking
2. **Backend:** Status checker implementations for each deployment strategy
3. **Backend:** New API endpoint `GET /api/clankers/:id/status`
4. **Shared Types:** `ResourceStatus` interface in `@viberator/types`
5. **Frontend:** Status indicator component for clanker pages
6. **Frontend:** Refresh button with loading state
