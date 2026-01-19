# Phase 3: Worker Configuration - Research

**Researched:** 2026-01-19
**Domain:** Worker payload-based configuration with credential fetching and instruction file retrieval
**Confidence:** HIGH

## Summary

This phase implements payload-based worker configuration where workers receive their configuration at invocation time from the platform. The architecture is hybrid: small configuration values passed in payload, large files (agents.md, claude.md) fetched from S3 (AWS workers) or mounted as volumes (Docker). The codebase already has foundational infrastructure: `getTenantSecret()` utility for SSM credential fetching, `CallbackClient` for result reporting, and existing worker entry points (`lambda-handler.ts`, `cli-handler.ts`).

The key architectural pattern is **type-specific payloads** where each worker type (Lambda/ECS/Docker) receives a payload schema tailored to its invocation model. AWS workers use platform AWS credentials to fetch from SSM/S3, while Docker workers receive credentials via `-e` flags at container start. A dedicated `ConfigLoader` class handles S3 instruction file fetching with retry logic.

**Primary recommendation:** Create type-specific payload interfaces (`LambdaPayload`, `EcsPayload`, `DockerPayload`), extend existing `getTenantSecret()` into a reusable `CredentialProvider` pattern in the worker, and implement `ConfigLoader` using `@aws-sdk/client-s3` for S3 file fetching.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-ssm` | ^3.0.0 | SSM Parameter Store for credential retrieval | Already in worker package.json, used by existing `getTenantSecret()` |
| `@aws-sdk/client-s3` | (add) | Fetch instruction files from S3 | Official AWS SDK v3 for S3, matches existing SSM pattern |
| `axios` | ^1.6.0 | HTTP client (already in codebase) | Existing standard for HTTP requests |
| `winston` | ^3.11.0 | Structured logging | Existing worker logging standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `aws-lambda` | ^1.0.7 | Lambda types and handler interfaces | Already in package.json for Lambda type definitions |
| `simple-git` | ^3.30.0 | Git operations with authenticated URLs | Existing GitService pattern for SCM auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSM Parameter Store | AWS Secrets Manager | Secrets Manager has lower cost but higher latency; SSM already implemented |
| Direct payload values | S3 fetch for all config | Small values in payload reduces latency; S3 for large files only |
| Platform API calls | Pre-signed S3 URLs | Platform API adds latency and requires auth; pre-signed URLs simpler |

**Installation:**
```bash
# Add S3 client for instruction file fetching
cd /home/jussi/Development/viberator/viberator/app
npm install @aws-sdk/client-s3
```

## Architecture Patterns

### Recommended Project Structure
```
viberator/app/src/
├── workers/
│   ├── lambda-handler.ts     # Modify: accept LambdaPayload
│   ├── cli-handler.ts        # Modify: accept DockerPayload
│   ├── viberator.ts          # Modify: initialize with clanker config
│   ├── types.ts              # Extend: add payload interfaces
│   ├── CallbackClient.ts     # Existing: non-blocking result reporting
│   ├── ConfigLoader.ts       # New: S3 instruction file fetching
│   └── CredentialProvider.ts # New: wrapper around getTenantSecret pattern
└── types/
    └── index.ts              # Existing: may need shared types

packages/types/src/
└── clanker.ts                # Existing: Clanker, ClankerConfigFile types
```

### Pattern 1: Type-Specific Worker Payloads

**What:** Separate TypeScript interfaces for each worker type's payload

**When to use:** Platform invokes worker with configuration data

**Example:**
```typescript
// Source: Based on existing CodingJobData in workers/types.ts
// and Clanker types from packages/types/src/clanker.ts

import { Clanker, ClankerConfigFile } from '@viberator/types';

// Base shared fields
interface BaseWorkerPayload {
  tenantId: string;
  jobId: string;
  clankerId: string;
  repository: string;
  task: string;
  branch?: string;
  baseBranch?: string;
  context?: {
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    stackTrace?: string;
    consoleErrors?: string[];
    affectedFiles?: string[];
  };
  settings?: {
    maxChanges?: number;
    testRequired?: boolean;
    codingStandards?: string;
    runTests?: boolean;
    testCommand?: string;
    maxExecutionTime?: number;
  };
}

// Lambda-specific: S3 URLs for instruction files, credential variable names
export interface LambdaPayload extends BaseWorkerPayload {
  workerType: 'lambda';
  // S3 URLs for larger instruction files
  instructionFiles: Array<{
    fileType: string;  // e.g., 'agents.md', 'claude.md'
    s3Url: string;    // s3://bucket/key
  }>;
  // Credential variable names (actual values fetched from SSM)
  requiredCredentials: string[];  // e.g., ['GITHUB_TOKEN', 'CLAUDE_API_KEY']
  // Clanker deployment config from platform
  deploymentConfig?: Record<string, unknown>;
}

// ECS-specific: similar to Lambda, runs in AWS environment
export interface EcsPayload extends BaseWorkerPayload {
  workerType: 'ecs';
  instructionFiles: Array<{
    fileType: string;
    s3Url: string;
  }>;
  requiredCredentials: string[];
  deploymentConfig?: Record<string, unknown>;
}

// Docker-specific: full config in payload, credentials via -e flags
export interface DockerPayload extends BaseWorkerPayload {
  workerType: 'docker';
  // Instruction files mounted as volumes, referenced by path
  instructionFiles: Array<{
    fileType: string;
    mountPath: string;  // e.g., /etc/agents/agents.md
  }>;
  // Credential names only - actual values in environment
  requiredCredentials: string[];
  // Full clanker config since no external storage access
  clankerConfig?: Clanker;
}
```

### Pattern 2: CredentialProvider for Workers

**What:** Wrapper around existing `getTenantSecret()` pattern for reusable credential fetching

**When to use:** Worker needs to fetch tenant credentials from SSM

**Example:**
```typescript
// Source: Based on existing getTenantSecret in utils/secrets.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { Logger } from 'winston';

/**
 * Worker-side credential provider
 * Fetches tenant credentials from SSM using platform AWS credentials
 *
 * Path structure: /prefix/{tenantId}/{key}
 * Example: /viberator/tenants/tenant-123/GITHUB_TOKEN
 */
export class CredentialProvider {
  private ssmClient: SSMClient;
  private cache: Map<string, { value: string; expiry: number }> = new Map();
  private readonly ttl = 1000 * 60 * 5; // 5 minutes
  private pathPrefix: string;

  constructor(logger: Logger, config?: { region?: string; pathPrefix?: string }) {
    this.pathPrefix = config?.pathPrefix ||
      process.env.TENANT_CONFIG_PATH_PREFIX ||
      '/viberator/tenants';

    this.ssmClient = new SSMClient({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Fetch credential for tenant from SSM
   * Returns undefined if not found (soft fail per CONTEXT.md decision)
   */
  async getCredential(tenantId: string, key: string): Promise<string | undefined> {
    const parameterName = `${this.pathPrefix}/${tenantId}/${key}`;

    // Check cache
    const cached = this.cache.get(parameterName);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }

    try {
      const response = await this.ssmClient.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        })
      );

      const value = response.Parameter?.Value;
      if (value) {
        this.cache.set(parameterName, {
          value,
          expiry: Date.now() + this.ttl,
        });
      }
      return value;
    } catch (error) {
      const errorName = (error as { name?: string }).name;
      if (errorName === 'ParameterNotFound') {
        return undefined; // Soft fail per CONTEXT.md
      }
      throw error;
    }
  }

  /**
   * Fetch multiple credentials for a tenant
   * Returns map of key -> value (missing keys have undefined value)
   */
  async getCredentials(tenantId: string, keys: string[]): Promise<Record<string, string | undefined>> {
    const results: Record<string, string | undefined> = {};

    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.getCredential(tenantId, key);
      })
    );

    return results;
  }

  /**
   * Validate required credentials are present
   * Logs warnings for missing credentials (per CONTEXT.md decision)
   */
  validateRequired(
    credentials: Record<string, string | undefined>,
    required: string[]
  ): { valid: boolean; missing: string[] } {
    const missing = required.filter(key => !credentials[key]);

    if (missing.length > 0) {
      // Log warning but continue (per CONTEXT.md decision)
      console.warn(`Missing required credentials: ${missing.join(', ')}`);
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
```

### Pattern 3: ConfigLoader for S3 Instruction Files

**What:** Dedicated class for fetching instruction files from S3

**When to use:** AWS workers (Lambda/ECS) need to fetch agents.md, claude.md files

**Example:**
```typescript
// Source: AWS S3 documentation for GetObjectCommand
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from 'winston';

export interface InstructionFile {
  fileType: string;
  content: string;
}

/**
 * ConfigLoader handles fetching configuration files from S3
 * Uses platform AWS credentials (not tenant-specific)
 */
export class ConfigLoader {
  private s3Client: S3Client;
  private logger: Logger;

  constructor(logger: Logger, config?: { region?: string }) {
    this.logger = logger;
    this.s3Client = new S3Client({
      region: config?.region || process.env.AWS_REGION || 'us-east-1',
    });
  }

  /**
   * Parse S3 URL into bucket and key
   * Supports s3://bucket/key format
   */
  private parseS3Url(s3Url: string): { bucket: string; key: string } {
    const url = new URL(s3Url);
    const bucket = url.hostname;
    const key = url.pathname.slice(1); // Remove leading slash
    return { bucket, key };
  }

  /**
   * Fetch a single instruction file from S3
   * Returns null if fetch fails (per CONTEXT.md: log warning and continue)
   */
  async fetchInstructionFile(s3Url: string): Promise<string | null> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);

      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      // Body.transformToString() from AWS SDK v3
      const content = await response.Body.transformToString();
      return content;
    } catch (error) {
      // Log warning but continue (per CONTEXT.md decision)
      this.logger.warn('Failed to fetch instruction file from S3', {
        s3Url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Fetch multiple instruction files
   * Returns array of successfully fetched files
   */
  async fetchInstructionFiles(files: Array<{
    fileType: string;
    s3Url: string;
  }>): Promise<InstructionFile[]> {
    const results: InstructionFile[] = [];

    await Promise.all(
      files.map(async (file) => {
        const content = await this.fetchInstructionFile(file.s3Url);
        if (content) {
          results.push({ fileType: file.fileType, content });
        }
      })
    );

    return results;
  }

  /**
   * Parse config file content (e.g., agents.md)
   * Returns structured data or null if malformed
   */
  parseConfig(content: string, fileType: string): Record<string, unknown> | null {
    try {
      // Basic parsing based on file type
      if (fileType.endsWith('.md')) {
        // For markdown files, return as-is or parse frontmatter
        return { content, type: 'markdown' };
      }

      // Try JSON parsing
      return JSON.parse(content);
    } catch (error) {
      // Log warning but continue (per CONTEXT.md decision)
      this.logger.warn('Failed to parse config file', {
        fileType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}
```

### Pattern 4: Worker Initialization with Payload

**What:** Integrate payload-based config into ViberatorWorker.initialize()

**When to use:** Worker starts, receives clanker config in payload

**Example:**
```typescript
// Source: Based on existing ViberatorWorker in viberator.ts
import { CredentialProvider } from './CredentialProvider';
import { ConfigLoader } from './ConfigLoader';
import { LambdaPayload, DockerPayload } from './types';

export class ViberatorWorker {
  private credentialProvider: CredentialProvider;
  private configLoader: ConfigLoader;
  private clankerConfig?: Record<string, unknown>;
  private instructionFiles: Map<string, string> = new Map();

  // ... existing properties

  async initialize(payload?: LambdaPayload | DockerPayload): Promise<void> {
    if (this.initialized) return;

    // Initialize credential and config loaders
    this.credentialProvider = new CredentialProvider(this.logger);
    this.configLoader = new ConfigLoader(this.logger);

    // Load clanker config from payload if provided
    if (payload?.deploymentConfig) {
      this.clankerConfig = payload.deploymentConfig;
    }

    // Load instruction files based on worker type
    if (payload?.workerType === 'lambda' || payload?.workerType === 'ecs') {
      const files = await this.configLoader.fetchInstructionFiles(
        payload.instructionFiles.map(f => ({ fileType: f.fileType, s3Url: f.s3Url }))
      );
      files.forEach(f => this.instructionFiles.set(f.fileType, f.content));
    } else if (payload?.workerType === 'docker') {
      // Docker files are mounted, read from filesystem
      for (const file of payload.instructionFiles) {
        try {
          const fs = await import('fs');
          const content = fs.readFileSync(file.mountPath, 'utf-8');
          this.instructionFiles.set(file.fileType, content);
        } catch (error) {
          this.logger.warn('Failed to read mounted config file', {
            path: file.mountPath,
            error,
          });
        }
      }
    }

    // ... rest of existing initialization
  }

  /**
   * Inject environment variables from clanker config
   */
  private injectEnvironmentVars(credentials: Record<string, string | undefined>): void {
    // Inject credentials as environment variables for agent execution
    // Key transformation: github_token -> GITHUB_TOKEN (per STATE.md decision)
    for (const [key, value] of Object.entries(credentials)) {
      if (value) {
        const envKey = keyToEnvVar(key); // Transform to UPPER_CASE
        process.env[envKey] = value;
      }
    }

    // Inject any clanker-configured environment variables
    if (this.clankerConfig?.environment) {
      for (const [key, value] of Object.entries(this.clankerConfig.environment as Record<string, string>)) {
        process.env[key] = value;
      }
    }
  }
}

function keyToEnvVar(key: string): string {
  // Transform lowercase/hyphenated keys to UPPER_CASE env var names
  // e.g., github_token -> GITHUB_TOKEN
  return key.toUpperCase().replace(/-/g, '_');
}
```

### Anti-Patterns to Avoid

- **Hardcoding credential names:** Use `requiredCredentials` from payload, not hardcoded `GITHUB_TOKEN`
- **Blocking initialization on S3 failures:** Log warnings and continue per CONTEXT.md decision
- **Duplicate SSM clients:** Share single SSMClient instance across CredentialProvider and ConfigLoader
- **Re-inventing retry logic:** Use AWS SDK's built-in retry with maxAttempts
- **Parsing clanker config in platform:** Workers parse their own config; platform just delivers it

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSM credential fetching | Custom HTTP calls to AWS API | `@aws-sdk/client-ssm` with `GetParameterCommand` | Handles auth, retries, region discovery, credential chain |
| S3 file fetching | Custom HTTP with signed URLs | `@aws-sdk/client-s3` with `GetObjectCommand` | Built-in streaming, error handling, credential chain |
| Credential caching | Custom Map with TTL | Simple Map with TTL is fine here | SSM fetching is relatively expensive; 5-min cache appropriate |
| Environment injection | Complex config templating | Direct `process.env` assignment | Workers are ephemeral; direct assignment simpler |
| Retry logic for S3 | Custom exponential backoff | AWS SDK built-in retry | Set `maxAttempts` in client config |

**Key insight:** AWS SDK v3 clients handle auth via default credential chain (Lambda role, EC2 role, ~/.aws/credentials), so workers don't need explicit credentials - they inherit from their execution environment.

## Common Pitfalls

### Pitfall 1: Confusing platform vs tenant credentials

**What goes wrong:** Worker tries to use tenant-specific credentials to fetch from SSM/S3, or assumes tenant data in platform credentials.

**Why it happens:** Not understanding that AWS workers use platform IAM roles, not tenant-specific role assumption.

**How to avoid:**
- AWS workers (Lambda/ECS): Use platform AWS credentials for SSM/S3 access
- Docker workers: No SSM/S3 access; credentials passed via `-e` flags
- SSM path scoping: `/prefix/{tenantId}/{key}` ensures tenant isolation

**Warning signs:** `AccessDenied` errors on SSM/S3, cross-tenant data access

### Pitfall 2: Hardcoded credential variable names

**What goes wrong:** Worker always looks for `GITHUB_TOKEN`, but clanker config specifies `github_token`.

**Why it happens:** Not respecting the `requiredCredentials` array from payload.

**How to avoid:**
- Always use `requiredCredentials` from payload
- Implement key transformation (lowercase to UPPER_CASE)
- Validate all required credentials before proceeding

### Pitfall 3: Blocking worker start on S3 failures

**What goes wrong:** Worker hangs or fails completely if one instruction file is missing from S3.

**Why it happens:** Not implementing graceful degradation per CONTEXT.md decision.

**How to avoid:**
- Log warning for missing files
- Continue execution with available config
- Only fail if critical files are missing (define "critical" per clanker config)

### Pitfall 4: Payload size limits in Lambda/ECS

**What goes wrong:** Large instruction files embedded in payload exceed Lambda event size limits (256KB) or ECS task definition limits.

**Why it happens:** Putting everything in payload instead of using S3 reference pattern.

**How to avoid:**
- Small values in payload (< 64KB recommended)
- Large files (agents.md, etc.) as S3 URLs
- Fetch large files asynchronously in initialize()

### Pitfall 5: SCM authentication without provider pattern

**What goes wrong:** Git operations fail because credentials aren't properly injected into GitService.

**Why it happens:** Not using existing `SCMAuthFactory` pattern that reads from environment variables.

**How to avoid:**
- Inject credentials as environment variables before GitService operations
- Use existing `SCMAuthFactory.authenticateUrl()` pattern
- Support multiple SCM providers (GitHub, GitLab, Bitbucket)

## Code Examples

Verified patterns from official sources:

### S3 GetObject with TypeScript (AWS SDK v3)
```typescript
// Source: https://docs.aws.amazon.com/code-library/latest/ug/javascript_3_s3_code_examples.html
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({});

export const fetchFile = async (bucket: string, key: string): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  try {
    const response = await client.send(command);
    // The Body object has 'transformToString', 'transformToByteArray', 'transformToWebStream'
    const str = await response.Body.transformToString();
    return str;
  } catch (err) {
    console.error(err);
    throw err;
  }
};
```

### SSM GetParameter with Caching
```typescript
// Source: Based on existing /home/jussi/Development/viberator/viberator/app/src/utils/secrets.ts
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const cache: Record<string, { value: string; expiry: number }> = {};
const TTL = 1000 * 60 * 5; // 5 minutes

export async function getTenantSecret(
  tenantId: string,
  key: string
): Promise<string | undefined> {
  const prefix = process.env.TENANT_CONFIG_PATH_PREFIX;
  const parameterName = `${prefix}/${tenantId}/${key}`;

  if (cache[parameterName] && cache[parameterName].expiry > Date.now()) {
    return cache[parameterName].value;
  }

  const response = await ssm.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    })
  );

  const value = response.Parameter?.Value;
  if (value) {
    cache[parameterName] = { value, expiry: Date.now() + TTL };
  }
  return value;
}
```

### GitHub Token Authentication (existing pattern)
```typescript
// Source: /home/jussi/Development/viberator/viberator/app/src/scm/providers/GithubAuthProvider.ts
// Shows environment-based credential reading and URL authentication

export class GithubAuthProvider implements SCMAuthProvider {
  getToken(): string | undefined {
    return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  }

  authenticateUrl(repoUrl: string): string {
    const token = this.getToken();
    if (!token) return repoUrl;

    // Convert SSH to HTTPS if needed, then inject token
    let httpsUrl = repoUrl;
    if (repoUrl.startsWith('git@github.com:')) {
      httpsUrl = repoUrl.replace('git@github.com:', 'https://github.com/');
    }

    const url = new URL(httpsUrl);
    url.username = 'x-access-token';
    url.password = token;
    return url.toString();
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Platform API for config | Payload-based config | Phase 3 decision | Workers don't call platform; more decoupled |
| All config in payload | Hybrid: payload + S3/volumes | Phase 3 decision | Avoids Lambda size limits |
| Hardcoded credential names | Dynamic from `requiredCredentials` | Phase 3 decision | More flexible, supports any SCM provider |
| Direct credential storage | Hierarchical SSM paths | Phase 1 | Tenant-scoped IAM policies possible |

**Deprecated/outdated:**
- Hardcoded `GITHUB_TOKEN` environment variable: Use `requiredCredentials` from payload
- Platform API calls from workers: Workers receive all needed config at invocation
- Single credential type: Support multiple SCM providers via provider pattern

## Open Questions

Things that couldn't be fully resolved:

1. **S3 URL format and expiration**
   - What we know: Platform generates S3 URLs for instruction files
   - What's unclear: Whether to use pre-signed URLs vs. IAM auth, URL expiration time
   - Recommendation: Use IAM auth (no pre-signing needed) for AWS workers; 24-hour expiration if pre-signed

2. **ConfigLoader fetch timing (init vs lazy)**
   - What we know: Instruction files need to be available during agent execution
   - What's unclear: Whether to fetch all at init or lazy-load on first use
   - Recommendation: Fetch all at initialize() for simplicity; lazy-loading optimization deferred

3. **Exact S3 URL pattern in payload**
   - What we know: Payload includes `s3Url` field for instruction files
   - What's unclear: Full ARN format vs. simple s3:// URL format
   - Recommendation: Use standard s3://bucket/key format; ConfigLoader handles parsing

4. **Docker volume mount paths**
   - What we know: Docker workers receive mounted file paths
   - What's unclear: Exact mount directory structure
   - Recommendation: Use /etc/viberator/config/{fileType} as convention

## Sources

### Primary (HIGH confidence)
- Existing codebase:
  - `/home/jussi/Development/viberator/viberator/app/src/workers/lambda-handler.ts` - Current Lambda entry point with getTenantSecret
  - `/home/jussi/Development/viberator/viberator/app/src/workers/viberator.ts` - ViberatorWorker class with initialize()/executeTask()
  - `/home/jussi/Development/viberator/viberator/app/src/workers/CallbackClient.ts` - Non-blocking callback pattern
  - `/home/jussi/Development/viberator/viberator/app/src/utils/secrets.ts` - Existing SSM credential fetching with 5-min cache
  - `/home/jussi/Development/viberator/viberator/app/src/scm/providers/GithubAuthProvider.ts` - SCM auth pattern
  - `/home/jussi/Development/viberator/packages/types/src/clanker.ts` - Clanker, ClankerConfigFile types
  - `/home/jussi/Development/viberator/platform/backend/src/credentials/providers/AwsSsmProvider.ts` - Server-side SSM provider pattern

- AWS Official Documentation:
  - [Amazon S3 examples using SDK for JavaScript (v3)](https://docs.aws.amazon.com/code-library/latest/ug/javascript_3_s3_code_examples.html) - GetObjectCommand with transformToString()

### Secondary (MEDIUM confidence)
- [3 AWS SDK for JavaScript v3 examples using TypeScript](https://medium.com/@claude.ducharme/3-aws-sdk-for-javascript-v3-examples-using-typescript-c1e1ab209ec6) - TypeScript S3 patterns (2022)

### Tertiary (LOW confidence)
- Various WebSearch results on AWS Lambda payload size limits - recommend testing for exact limits
- Docker volume mounting patterns - well-established but verify with actual deployment

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All AWS SDK packages already in codebase or verified
- Architecture: HIGH - Based on verified existing patterns in secrets.ts, CallbackClient.ts, GithubAuthProvider.ts
- Pitfalls: HIGH - Identified from common AWS worker patterns and existing codebase

**Research date:** 2026-01-19
**Valid until:** 2026-02-18 (30 days - AWS SDK patterns stable, but API updates possible)
