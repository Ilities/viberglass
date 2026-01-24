# Phase 1: Multi-Tenant Security Foundation - Research

**Researched:** 2026-01-19
**Domain:** Multi-tenant credential storage with cloud-agnostic provider interface
**Confidence:** HIGH

## Summary

This phase implements a cloud-agnostic credential storage interface for multi-tenant security. The codebase already has foundational patterns to build upon: an existing `getTenantSecret()` function that uses AWS SSM, a provider factory pattern for SCM authentication, and tenant-aware job data structures. The standard approach uses AWS SDK v3's `@aws-sdk/client-ssm` for Parameter Store operations, with Node.js built-in `crypto` module for encrypted local file storage using AES-256-GCM.

The key architectural decision is a **fallback chain pattern** (Environment -> File -> AWS) with first-success-wins semantics. Each provider implements a simple `get/put/delete` interface scoped by `tenantId`. Security requirements mandate no credential values in logs, error messages, or API responses.

**Primary recommendation:** Follow the existing codebase patterns (SCMAuthFactory interface style) for consistency, use `@aws-sdk/client-ssm` v3 commands (GetParameterCommand, PutParameterCommand, DeleteParameterCommand), and implement FileProvider with AES-256-GCM encryption using 12-byte IVs for interoperability.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@aws-sdk/client-ssm` | ^3.0.0 | AWS Parameter Store operations | AWS SDK v3 is modular, TypeScript-first, officially maintained |
| `crypto` | Node.js built-in | AES-256-GCM encryption for file storage | Standard library, battle-tested, no dependencies |
| `@aws-sdk/client-node` | ^3.0.0 | Node.js credential provider for AWS | Auto-credential loading for Lambda/EC2 environments |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `winston` | ^3.11.0 | Structured logging (already in codebase) | Existing project standard for logging |
| `dotenv` | ^16.3.0 | Environment variable loading | Local development configuration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SSM Parameter Store | AWS Secrets Manager | Secrets Manager has automatic rotation but higher cost; SSM is sufficient and cheaper |
| AES-256-GCM | AES-256-CBC | GCM has built-in authentication (AEAD), more secure than CBC |
| Node.js crypto | external crypto libs | Built-in is audited, maintained, no extra dependencies |

**Installation:**
```bash
npm install @aws-sdk/client-ssm @aws-sdk/client-node
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/
├── credentials/
│   ├── CredentialProvider.ts      # Base interface
│   ├── providers/
│   │   ├── EnvironmentProvider.ts  # ENV var fallback
│   │   ├── FileProvider.ts          # Encrypted JSON file
│   │   └── AwsSsmProvider.ts        # AWS SSM Parameter Store
│   ├── CredentialProviderFactory.ts # Fallback chain orchestration
│   └── types.ts                    # Provider interfaces
├── api/
│   └── middleware/
│       └── tenantValidation.ts     # Tenant-scoped API validation
└── config/
    └── credentials.ts              # Central config object

viberator/app/src/
├── credentials/
│   ├── CredentialProvider.ts       # Shared interface (or use @viberglass/types package)
│   └── providers/                  # Reuse or symlink to backend providers
```

### Pattern 1: Provider Interface (following existing SCMAuthProvider pattern)

**What:** Interface defining get/put/delete operations scoped by tenantId

**When to use:** All credential storage operations

**Example:**
```typescript
// Source: Based on existing viberator/app/src/scm/types.ts pattern
export interface CredentialProvider {
  /**
   * Get credential value for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key
   * @returns Credential value or null if not found
   */
  get(tenantId: string, key: string): Promise<string | null>;

  /**
   * Store credential value for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key
   * @param value - Credential value to store
   */
  put(tenantId: string, key: string, value: string): Promise<void>;

  /**
   * Delete credential for a tenant
   * @param tenantId - Tenant identifier
   * @param key - Credential key
   */
  delete(tenantId: string, key: string): Promise<void>;
}
```

### Pattern 2: Fallback Chain (from CONTEXT.md decision)

**What:** Try providers in order (Environment -> File -> AWS), first success wins

**When to use:** All credential lookups via CredentialProviderFactory

**Example:**
```typescript
// Source: CONTEXT.md implementation decision
export class CredentialProviderFactory {
  private providers: CredentialProvider[];

  constructor(config: CredentialConfig) {
    this.providers = [
      new EnvironmentProvider(),
      new FileProvider(config.file),
      new AwsSsmProvider(config.aws),
    ];
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    for (const provider of this.providers) {
      try {
        const value = await provider.get(tenantId, key);
        if (value !== null) {
          this.logger.debug(`Credential found in ${provider.name}`, {
            tenantId,
            key,
            provider: provider.name,
          });
          return value;
        }
      } catch (error) {
        // Log warning, continue to next provider
        this.logger.warn(`Provider ${provider.name} failed, trying next`, {
          tenantId,
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return null;
  }

  // Similar patterns for put/delete (usually only use primary provider)
}
```

### Pattern 3: AWS SSM Provider (using SDK v3)

**What:** Concrete provider using AWS Parameter Store with tenant-scoped paths

**When to use:** Production deployments, AWS environments

**Example:**
```typescript
// Source: AWS SDK v3 documentation + existing viberator/app/src/utils/secrets.ts
import { SSMClient, GetParameterCommand, PutParameterCommand, DeleteParameterCommand } from "@aws-sdk/client-ssm";

export class AwsSsmProvider implements CredentialProvider {
  name = "AwsSsmProvider";
  private client: SSMClient;
  private pathPrefix: string;

  constructor(config: { region?: string; pathPrefix?: string }) {
    this.client = new SSMClient({
      region: config.region || process.env.AWS_REGION,
    });
    this.pathPrefix = config.pathPrefix || "/viberator/tenants";
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const parameterName = `${this.pathPrefix}/${tenantId}/${key}`;

    const response = await this.client.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      })
    );

    return response.Parameter?.Value ?? null;
  }

  async put(tenantId: string, key: string, value: string): Promise<void> {
    const parameterName = `${this.pathPrefix}/${tenantId}/${key}`;

    await this.client.send(
      new PutParameterCommand({
        Name: parameterName,
        Value: value,
        Type: "SecureString",
        Overwrite: true,
      })
    );
  }

  async delete(tenantId: string, key: string): Promise<void> {
    const parameterName = `${this.pathPrefix}/${tenantId}/${key}`;

    await this.client.send(
      new DeleteParameterCommand({
        Name: parameterName,
      })
    );
  }
}
```

### Pattern 4: File Provider with AES-256-GCM encryption

**What:** Local development provider storing encrypted credentials in JSON file

**When to use:** Local development, testing environments

**Example:**
```typescript
// Source: Node.js crypto best practices with 12-byte IV for interoperability
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes for GCM (better interoperability than 16)
const AUTH_TAG_LENGTH = 16;

export class FileProvider implements CredentialProvider {
  name = "FileProvider";
  private filePath: string;
  private key: Buffer;

  constructor(config: { filePath: string; encryptionKey: string }) {
    this.filePath = config.filePath;
    // Derive 32-byte key from encryption key string
    this.key = Buffer.from(config.encryptionKey, "hex").slice(0, 32);
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const data = await this.readEncryptedFile();

    const tenantCreds = data[tenantId];
    if (!tenantCreds) return null;

    return tenantCreds[key] ?? null;
  }

  async put(tenantId: string, key: string, value: string): Promise<void> {
    const data = await this.readEncryptedFile();

    if (!data[tenantId]) {
      data[tenantId] = {};
    }
    data[tenantId][key] = value;

    await this.writeEncryptedFile(data);
  }

  async delete(tenantId: string, key: string): Promise<void> {
    const data = await this.readEncryptedFile();

    if (data[tenantId]) {
      delete data[tenantId][key];
      if (Object.keys(data[tenantId]).length === 0) {
        delete data[tenantId];
      }
    }

    await this.writeEncryptedFile(data);
  }

  private async readEncryptedFile(): Promise<Record<string, Record<string, string>>> {
    try {
      const encrypted = await fs.readFile(this.filePath);
      return this.decrypt(encrypted);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {}; // File doesn't exist yet
      }
      throw error;
    }
  }

  private decrypt(encrypted: Buffer): Record<string, Record<string, string>> {
    const iv = encrypted.subarray(0, IV_LENGTH);
    const authTag = encrypted.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString("utf-8"));
  }

  private encrypt(data: Record<string, Record<string, string>>): Buffer {
    const plaintext = Buffer.from(JSON.stringify(data, null, 2), "utf-8");
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]);
  }
}
```

### Anti-Patterns to Avoid

- **Putting credential values in logs:** Use structured logging with redaction. Winston's custom formatter can redact sensitive keys.
- **Reusing IVs in encryption:** Always generate random IVs for AES-GCM. Never reuse.
- **Hardcoding encryption keys:** Load from secure environment variable or derive from runtime context.
- **Cascading fallbacks for same key:** "First success wins" means stop after first provider returns a value, don't cascade.
- **Returning raw errors to clients:** Catch provider errors, log internally, return generic message to API consumers.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AWS credential loading | Custom AWS auth chains | `@aws-sdk/client-node` credential providers | Handles Lambda, EC2, SSO, profile loading |
| Encryption primitives | Custom crypto algorithms | Node.js built-in `crypto` | Audited, FIPS-compliant options available |
| JSON schema validation | Custom validation logic | `joi` (already in codebase) | Existing project standard |
| Configuration loading | Custom config parsers | `dotenv` + typed config objects | Already used throughout project |

**Key insight:** Custom credential providers for the interface are necessary (this is the point), but underlying crypto, AWS auth, and configuration should use battle-tested libraries.

## Common Pitfalls

### Pitfall 1: Leaking credentials in logs

**What goes wrong:** Credential values appear in application logs, debug output, or error messages

**Why it happens:** Logging entire objects (`logger.debug({ data })`) or error objects containing sensitive data

**How to avoid:**
- Use structured logging with redaction middleware
- Create a sanitized version of objects for logging
- Never log credential values, only keys and tenant IDs

**Warning signs:** Test logs showing token values, stack traces with secrets

```typescript
// GOOD: Redaction middleware for winston
const sensitiveKeys = ['token', 'password', 'apiKey', 'secret', 'credential'];

function sanitize(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);

  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = typeof value === 'object' ? sanitize(value) : value;
    }
  }
  return sanitized;
}
```

### Pitfall 2: Tenant confusion in multi-provider scenarios

**What goes wrong:** Credentials from tenant A returned when tenant B requests

**Why it happens:** Missing tenant validation, misconfigured path prefixes, or provider state leakage

**How to avoid:**
- Always scope operations by tenantId at provider level
- Use hierarchical SSM paths: `/prefix/{tenantId}/{key}`
- Validate tenantId format at API boundary

**Warning signs:** Tests passing with wrong tenant data, SSM path confusion

### Pitfall 3: File provider without encryption

**What goes wrong:** Credentials stored in plaintext for local development

**Why it happens:** "It's just local dev" mentality, shipping local credentials file

**How to avoid:**
- Always encrypt, even in development
- Add .credentials.json to .gitignore
- Use environment-specific encryption keys

**Warning signs:** Plaintext credentials in repo, file readable by other users

### Pitfall 4: SSM parameter name conflicts

**What goes wrong:** Deleting/overwriting parameters across tenants

**Why it happens:** Missing tenantId in parameter path, non-hierarchical naming

**How to avoid:**
- Enforce hierarchical naming: `/viberator/tenants/{tenantId}/{key}`
- Validate tenantId doesn't contain slashes
- Use tenant-scoped IAM policies

**Warning signs:** SSM paths without tenant prefix, flat parameter structure

### Pitfall 5: Fallback chain silent failures

**What goes wrong:** All providers fail but no error is surfaced

**Why it happens:** Swallowing exceptions without aggregation

**How to avoid:**
- Log each provider failure with context
- Return null only after all providers exhausted
- Consider optional "strict mode" that throws if all fail

**Warning signs:** Debugging reveals all providers errored silently

## Code Examples

Verified patterns from official sources:

### AWS SSM Get Operation
```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const client = new SSMClient({ region: "us-east-1" });
const command = new GetParameterCommand({
  Name: "/viberator/tenants/tenant-123/GITHUB_TOKEN",
  WithDecryption: true,
});
const response = await client.send(command);
const value = response.Parameter?.Value; // string | undefined
```

### AWS SSM Put Operation
```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm
import { PutParameterCommand } from "@aws-sdk/client-ssm";

const command = new PutParameterCommand({
  Name: "/viberator/tenants/tenant-123/GITHUB_TOKEN",
  Value: "ghp_xxxxx",
  Type: "SecureString",
  Overwrite: true,
});
await client.send(command);
```

### AWS SSM Delete Operation
```typescript
// Source: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm
import { DeleteParameterCommand } from "@aws-sdk/client-ssm";

const command = new DeleteParameterCommand({
  Name: "/viberator/tenants/tenant-123/GITHUB_TOKEN",
});
await client.send(command);
// Note: Wait 30 seconds before recreating parameter with same name
```

### Environment Provider
```typescript
// Pattern from existing GithubAuthProvider in viberator/app/src/scm/providers/
export class EnvironmentProvider implements CredentialProvider {
  name = "EnvironmentProvider";

  get(tenantId: string, key: string): Promise<string | null> {
    // Convert key to env var format: GITHUB_TOKEN, CLAUDE_API_KEY
    const envKey = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const value = process.env[envKey];

    return Promise.resolve(value ?? null);
  }

  put(_tenantId: string, _key: string, _value: string): Promise<void> {
    // Environment is read-only at runtime
    return Promise.reject(new Error("EnvironmentProvider is read-only"));
  }

  delete(_tenantId: string, _key: string): Promise<void> {
    // Environment is read-only at runtime
    return Promise.reject(new Error("EnvironmentProvider is read-only"));
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AWS SDK v2 (`aws-sdk`) | AWS SDK v3 (`@aws-sdk/client-*`) | 2020-2021 | Modular bundles, TypeScript-first, Promise-based |
| AES-256-CBC | AES-256-GCM | ~2018+ | GCM provides built-in authentication (AEAD) |
| 16-byte IV for GCM | 12-byte IV for GCM | Ongoing standard | Better cross-language interoperability |

**Deprecated/outdated:**
- `aws-sdk` (v2): Replaced by modular `@aws-sdk/client-*` packages
- Environment variables for production secrets: Use SSM/Secrets Manager instead
- Plaintext local files: Always encrypt with AES-256-GCM

## Open Questions

Things that couldn't be fully resolved:

1. **Config object structure**
   - What we know: Central config object passed to providers (CONTEXT.md decision)
   - What's unclear: Exact field names, whether to use TypeScript interfaces or runtime schemas
   - Recommendation: Define `CredentialConfig` interface matching existing patterns in `Configuration` type

2. **Provider initialization error handling**
   - What we know: Provider failures should be logged as warnings (CONTEXT.md decision)
   - What's unclear: Whether to fail fast on init or lazy-load on first use
   - Recommendation: Lazy initialization for AWS client (already done in existing ConfigManager), validate file path on first use

3. **Encryption key derivation for FileProvider**
   - What we know: Need encryption key for local file storage
   - What's unclear: Whether to derive from environment variable or require hex-encoded key
   - Recommendation: Use `CREDENTIALS_ENCRYPTION_KEY` environment variable, validate it's a 64-char hex string (32 bytes)

## Sources

### Primary (HIGH confidence)
- [AWS SDK v3 SSM Client](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm) - Full command reference (GetParameterCommand, PutParameterCommand, DeleteParameterCommand)
- Existing codebase:
  - `/home/jussi/Development/viberator/viberator/app/src/utils/secrets.ts` - Current SSM pattern with tenant scoping
  - `/home/jussi/Development/viberator/viberator/app/src/scm/types.ts` - Provider interface pattern to follow
  - `/home/jussi/Development/viberator/viberator/app/src/scm/SCMAuthFactory.ts` - Factory pattern for providers
  - `/home/jussi/Development/viberator/viberator/app/src/config/ConfigManager.ts` - Configuration pattern
  - `/home/jussi/Development/viberator/platform/backend/migrations/005_add_jobs_table.ts` - Database tenant_id column

### Secondary (MEDIUM confidence)
- [Jest Mocking Best Practices - Microsoft ISE](https://devblogs.microsoft.com/ise/jest-mocking-best-practices/) - Testing patterns for credential providers
- [Mocking AWS with Jest and TypeScript](https://dev.to/elthrasher/mocking-aws-with-jest-and-typescript-199i) - AWS SDK mocking in tests
- [Node.js Security Best Practices](https://nodejs.org/en/learn/getting-started/security-best-practices) - Official Node.js security guidelines
- [AES-256-GCM Implementation Example](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) - Verified crypto usage patterns
- [Managing Service Account Credentials with AES-256-GCM](https://kamlasater.com/blog/managing-service-account-credentials-json-files/) - JSON file encryption patterns

### Tertiary (LOW confidence)
- Various WebSearch results on multi-tenant architecture patterns - general guidance only, no direct implementation details
- Multi-tenant SaaS guides - generic patterns, not specific to credential storage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - AWS SDK v3 and Node.js crypto are well-documented standards
- Architecture: HIGH - Based on verified existing patterns in codebase plus official AWS documentation
- Pitfalls: HIGH - Identified from security best practices and common crypto mistakes

**Research date:** 2026-01-19
**Valid until:** 2026-02-18 (30 days - stable domain, but AWS SDK updates and security practices evolve)
