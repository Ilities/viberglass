# Phase 3: Worker Configuration - Research

**Researched:** 2026-01-19
**Domain:** Worker configuration, credential injection, clanker configuration, SCM authentication
**Confidence:** MEDIUM

## Summary

This phase focuses on how workers receive and consume their configuration at invocation time. The current ViberatorWorker has a hardcoded ConfigManager that reads from environment variables and AWS SSM, but this needs to be refactored to receive configuration from the platform API instead. The key insight from CONTEXT.md is that credentials will be **pre-injected as environment variables** by the platform, with the platform passing variable names to the worker at invocation time.

**Primary recommendation:** Use the existing CredentialProviderFactory pattern on the worker side, with a new WorkerConfigurationClient that fetches clanker config from the platform API. The worker receives credential variable names in the job payload and reads them from its environment.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| simple-git | latest | Git operations with auth | Already in use, handles credential injection via URL |
| axios | latest | HTTP client for platform API | Already in use (CallbackClient) |
| @aws-sdk/client-ssm | ^3.x | SSM Parameter Store access | Already in use, current secret fetching pattern |
| winston | latest | Structured logging | Already in use throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | latest | Environment variable loading | Already in use (ConfigManager) |
| kysely | latest | Type-safe SQL (platform DAOs) | Already in use, not needed in worker |

### New Components Needed
| Component | Purpose | Pattern |
|-----------|---------|---------|
| WorkerConfigurationClient | Fetch clanker config from platform API | REST client with tenant header |
| CredentialInjector | Inject environment vars before agent execution | process.env manipulation |
| SCMCredentialResolver | Resolve SCM credentials from variable names | Factory pattern lookup |

**Installation:**
```bash
# No new packages needed - using existing dependencies
npm install simple-git axios @aws-sdk/client-ssm winston dotenv
```

## Architecture Patterns

### Recommended Project Structure
```
viberator/app/src/
├── workers/
│   ├── viberator.ts           # Main worker (refactor)
│   ├── types.ts               # Job types (extend with config)
│   ├── CallbackClient.ts      # Existing (Phase 2)
│   └── WorkerConfigurationClient.ts  # NEW: Fetch config from platform
├── scm/
│   ├── SCMAuthFactory.ts      # Existing (extend with dynamic creds)
│   ├── types.ts               # Existing SCMAuthProvider
│   └── providers/             # Existing GitHub/GitLab/Bitbucket
├── credentials/               # NEW: Share platform's CredentialProvider
│   ├── CredentialProvider.ts  # Copied from platform/backend
│   ├── CredentialProviderFactory.ts  # Copied from platform/backend
│   └── providers/             # Environment, File (no AWS in worker)
└── config/
    └── ConfigManager.ts       # Refactor: read from platform, not SSM directly
```

### Pattern 1: Worker Configuration Payload (from CONTEXT.md)

**What:** Configuration is passed to workers at invocation time via job payload. Credentials are pre-injected as environment variables, with variable names passed in the payload.

**When to use:** All worker invocations (Lambda, ECS, Docker)

**Structure:**
```typescript
// Extended CodingJobData interface
export interface CodingJobData {
  // Existing fields
  id: string;
  tenantId: string;
  repository: string;
  task: string;
  // ... context, settings

  // NEW: Configuration fields
  clankerConfig: {
    id: string;
    name: string;
    slug: string;
    environmentVariables: Record<string, string>;
    configFiles: {
      fileType: string;
      content: string;
    }[];
    deploymentConfig?: Record<string, unknown>;
  };
  executor: {
    type: 'lambda' | 'ecs' | 'docker';
    config?: Record<string, unknown>;
  };
  credentials: {
    name: string;      // e.g., 'GITHUB_TOKEN'
    type: string;      // e.g., 'token', 'api_key'
    requiredFor: string[];  // e.g., ['scm', 'api']
  }[];
}
```

### Pattern 2: Environment Variable Injection

**What:** Worker reads credential values from environment using names passed in payload.

**When to use:** Before agent execution, before git operations

**Example:**
```typescript
// Source: Existing lambda-handler.ts pattern (lines 38-40)
// Extracted as reusable pattern

class CredentialInjector {
  inject(credentials: {name: string}[]): void {
    for (const cred of credentials) {
      const value = process.env[cred.name];
      if (!value) {
        throw new Error(`Missing required credential: ${cred.name}`);
      }
      // Already in env from platform, validate presence
    }
  }
}
```

### Pattern 3: SCM Credential Resolution

**What:** Resolve SCM credentials dynamically per-job based on provider URLs and available credentials.

**When to use:** Before git clone/pull/push operations

**Example:**
```typescript
// Refactor existing SCMAuthFactory to support dynamic credential injection

// Source: viberator/app/src/scm/SCMAuthFactory.ts (extend)
class SCMAuthFactory {
  private static dynamicCredentials: Map<string, string> = new Map();

  // NEW: Inject credential for specific provider
  static injectCredential(provider: string, token: string): void {
    this.dynamicCredentials.set(provider, token);
  }

  // MODIFY: Check dynamic credentials before environment
  static getProvider(repoUrl: string): SCMAuthProvider | null {
    const provider = this.providers.find(p => p.canHandle(repoUrl)) || null;
    return provider;
  }
}

// Modify GithubAuthProvider to accept injected token
class GithubAuthProvider implements SCMAuthProvider {
  private injectedToken?: string;

  setToken(token: string): void {
    this.injectedToken = token;
  }

  getToken(): string | undefined {
    return this.injectedToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }
}
```

### Anti-Patterns to Avoid

- **Direct SSM calls from worker:** Workers should not call AWS SSM directly. Platform pre-fetches credentials and injects as environment variables.
- **Hardcoded credential keys:** Don't assume specific env var names. Use names from payload.
- **ConfigManager reading SSM:** Remove direct SSM access from ConfigManager. Platform provides all config.
- **Clanker config in job payload:** Don't embed full clanker config in job. Send clanker ID and fetch from platform API.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credential storage interface | Custom credential handling | Copy CredentialProvider from platform/backend | Already battle-tested, supports fallback chain |
| Git credential injection | Custom URL manipulation | simple-git with authenticated URLs | Already handles all edge cases, SSH/HTTPS conversion |
| HTTP retries | Custom retry logic | CallbackClient pattern (exponential backoff) | Already implements correct retry semantics |
| Environment variable parsing | Custom env var handling | Existing dotenv + EnvironmentProvider pattern | Handles edge cases like empty strings, undefined |

**Key insight:** The platform already has a robust CredentialProvider system. Reuse it in the worker by copying the interface and providers (minus AWS SSM which is platform-side only).

## Common Pitfalls

### Pitfall 1: Credential Leakage in Logs

**What goes wrong:** Credentials appear in worker logs, especially during git operations or HTTP requests.

**Why it happens:** Simple-git logs URLs by default, axios logs request bodies.

**How to avoid:**
- Already implemented in CallbackClient (lines 124-143): redactSensitiveInfo()
- Apply same pattern to GitService logging
- Never log credential values, only variable names

**Warning signs:** Credentials visible in CloudWatch Logs, log aggregation systems.

### Pitfall 2: Environment Variable Race Conditions

**What goes wrong:** Lambda container reuse causes credentials from previous job to leak into next job.

**Why it happens:** Lambda freezes execution context between invocations. process.env persists.

**How to avoid:**
- Already pattern exists in lambda-handler.ts (lines 60-62): clear credentials in finally block
- Apply same pattern to all worker entry points
- Always set credentials before job, clear after

**Warning signs:** Worker uses wrong tenant's credentials, intermittent auth failures.

### Pitfall 3: Platform API Rate Limiting

**What goes wrong:** Workers flood platform API with clanker config requests.

**Why it happens:** No caching, many concurrent workers.

**How to avoid:**
- Implement in-memory cache for clanker configs (TTL: 5-15 minutes)
- Use conditional requests if platform supports ETag/Last-Modified
- Consider passing full config in payload for frequently-used clankers

**Warning signs:** 429 responses from platform API, slow worker startup.

### Pitfall 4: Missing Required Credentials

**What goes wrong:** Worker starts job but fails mid-execution due to missing credential.

**Why it happens:** Platform didn't inject all required credentials, worker didn't validate upfront.

**How to avoid:**
- Validate all required credentials present in environment before starting job
- Fail fast with clear error message listing missing credentials
- Log which credentials were expected vs found

**Warning signs:** Job fails after git clone succeeds, API calls fail with 401.

## Code Examples

Verified patterns from existing codebase:

### Fetching Tenant Credentials (Current Pattern)

```typescript
// Source: viberator/app/src/utils/secrets.ts (lines 7-30)
// Current implementation calls SSM directly - will be replaced

// NEW PATTERN: Read from environment instead
function getTenantCredential(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required credential: ${key}`);
  }
  return value;
}
```

### Git Authentication with Token Injection

```typescript
// Source: viberator/app/src/scm/providers/GithubAuthProvider.ts (lines 27-64)
// Pattern for authenticating URLs with tokens

authenticateUrl(repoUrl: string): string {
  const token = this.getToken();  // From env or injected

  if (!token) {
    return repoUrl;  // No auth available
  }

  // Convert SSH to HTTPS if needed
  let httpsUrl = repoUrl;
  if (repoUrl.startsWith("git@github.com:")) {
    httpsUrl = repoUrl.replace("git@github.com:", "https://github.com/");
  }

  const url = new URL(httpsUrl);
  url.username = "x-access-token";
  url.password = token;

  return url.toString();
}
```

### Clanker Config Structure (from types)

```typescript
// Source: packages/types/src/clanker.ts (lines 29-42)
// Existing clanker type structure

interface Clanker {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  deploymentStrategyId?: string | null;
  deploymentConfig?: Record<string, unknown> | null;
  configFiles: ClankerConfigFile[];  // Key for agents.md, etc.
  status: ClankerStatus;
  statusMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Existing CallbackClient Pattern (for reference)

```typescript
// Source: viberator/app/src/workers/CallbackClient.ts
// Use this pattern for WorkerConfigurationClient

class WorkerConfigurationClient {
  constructor(
    private logger: Logger,
    private platformUrl: string,
    private tenantId: string,
  ) {}

  async getClankerConfig(clankerId: string): Promise<Clanker> {
    const url = `${this.platformUrl}/api/clankers/${clankerId}`;

    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": this.tenantId,
      },
      timeout: 10000,
    });

    return response.data.data;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct SSM calls from worker | Platform fetches credentials, injects as env vars | This phase | Workers become cloud-agnostic, platform controls access |
| Hardcoded clanker config | Fetched from platform API per job | This phase | Dynamic configuration, no redeploys needed |
| Environment-only credential resolution | Variable names in payload, values in env | This phase | Explicit credential requirements, better validation |

**Deprecated/outdated:**
- `viberator/app/src/utils/secrets.ts`: Direct SSM calls will be removed from worker
- `ConfigManager.loadConfiguration()`: SSM parameter loading will be removed

## Open Questions

1. **Config file delivery mechanism:**
   - What we know: Clanker stores config files (agents.md, claude.md, etc.) in database
   - What's unclear: Should config files be fetched from API or embedded in job payload?
   - Recommendation: Fetch from API with in-memory caching; embed only if payload size < 256KB (Lambda limit)

2. **Executor specification format:**
   - What we know: Migration defines deployment strategies (docker, ecs, aws-lambda-container)
   - What's unclear: How much executor config should be in job payload vs fetched separately?
   - Recommendation: Pass minimal executor type in payload, fetch full config from platform when needed

3. **Credential variable naming convention:**
   - What we know: EnvironmentProvider uses uppercase (GITHUB_TOKEN)
   - What's unclear: Should we enforce SCOPED names (TENANT_GITHUB_TOKEN)?
   - Recommendation: Use standard names (GITHUB_TOKEN) since Lambda/ECS containers are ephemeral and single-tenant per invocation

4. **Clanker config caching strategy:**
   - What we know: Configs can change (clanker status updates, config file edits)
   - What's unclear: How long to cache, invalidation strategy?
   - Recommendation: 5-minute TTL, no active invalidation (acceptable staleness for worker jobs)

## Sources

### Primary (HIGH confidence)
- **Existing codebase analysis** - Read all worker, credential, SCM, and clanker-related files
- **CONTEXT.md** - User decisions for this phase (locked choices)

### Secondary (MEDIUM confidence)
- [AWS Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html) - Official Lambda environment variable documentation
- [AWS SaaS Tenant Isolation Pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/implement-saas-tenant-isolation-for-amazon-s3-by-using-an-aws-lambda-token-vending-machine.html) - Multi-tenant credential patterns
- [AWS Lambda-ECS Worker Pattern](https://github.com/aws-samples/lambda-ecs-worker-pattern) - Sample architecture (attempted fetch, may need verification)

### Tertiary (LOW confidence)
- [Git Credential Manager Documentation](https://git-scm.com/docs/gitcredentials) - Git credential helper patterns (general reference)
- [Anatomy of The 2025 npm Worm](https://motasimhamdan.medium.com/anatomy-of-the-2025-npm-worm-the-largest-supply-chain-hack-3a64560d5c8f) - Security context for credential handling

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages already in use, verified in package.json
- Architecture: MEDIUM - Existing patterns proven, but new integration points need validation
- Pitfalls: MEDIUM - Based on common AWS/Lambda patterns, some specifics need runtime testing

**Research date:** 2026-01-19
**Valid until:** 2026-02-18 (30 days - stable domain, but AWS patterns evolve)
