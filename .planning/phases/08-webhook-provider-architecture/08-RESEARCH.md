# Phase 8: Webhook Provider Architecture - Research

**Researched:** 2026-01-22
**Domain:** Webhook integration architecture, provider plugin system, event-driven processing
**Confidence:** HIGH

## Summary

This phase implements a provider-agnostic webhook integration system with GitHub and Jira as the first two providers. The core challenge is designing a secure, extensible plugin architecture that handles incoming webhook events, validates signatures, prevents replay attacks, and provides outbound API capabilities for posting results back to platforms.

**Primary recommendation:** Use a hybrid approach combining (1) a generic HMAC-SHA256 signature validator with configurable algorithms, (2) a TypeScript interface-based plugin system using abstract base classes with dynamic loading from a providers directory, and (3) idempotency through database-tracked delivery IDs with timing-safe signature verification using Node.js built-in `crypto.timingSafeEqual()`.

## Standard Stack

The established libraries/tools for webhook provider architecture in TypeScript/Node.js:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` | Built-in | HMAC-SHA256 signature verification, timing-safe comparison | Official GitHub docs recommend `crypto.timingSafeEqual()` for security |
| `express` | ^4.19.x / ^5.x | HTTP server with raw body parsing middleware | Required for signature verification on raw request body |
| `kysely` | ^0.26.x | Type-safe database queries for idempotency tracking | Already in use in the project |
| `axios` | ^1.6.x | Outbound API calls to GitHub/Jira | Already in use in the project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `crypto.timingSafeEqual()` | Built-in | Constant-time signature comparison | Always - prevents timing attack vulnerabilities |
| `express.raw()` | Built-in middleware | Capture raw request body before JSON parsing | Required for signature verification |
| `@octokit/webhooks` | ^10.x | GitHub webhook verification (optional) | If using Octokit instead of raw crypto |
| UUID generation | Built-in `crypto.randomUUID()` | Idempotency keys, event tracking | For tracking processed webhook events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw `crypto` module | `@octokit/webhooks` library | Octokit is GitHub-specific; need generic solution for multiple providers |
| Raw body parsing | `body-parser.json()` | Body parser mutates body; need raw for signature verification |
| Database idempotency | Redis in-memory | Redis is faster but adds dependency; database already available |

**Installation:**
```bash
# Core dependencies (likely already installed)
npm install express crypto axios kysely

# Optional GitHub-specific verification
npm install @octokit/webhooks
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/
├── webhooks/
│   ├── provider.ts              # Base WebhookProvider interface
│   ├── registry.ts              # Provider registry with dynamic loading
│   ├── validator.ts             # Generic signature validator
│   ├── middleware/
│   │   ├── signature.ts         # Express middleware for signature verification
│   │   └── idempotency.ts       # Deduplication middleware
│   ├── providers/
│   │   ├── github-provider.ts   # GitHub webhook implementation
│   │   ├── jira-provider.ts     # Jira webhook implementation
│   │   └── base-provider.ts     # Abstract base class
│   └── routes.ts                # Express route handlers
├── outbound/
│   ├── api-client.ts            # Generic outbound API client
│   └── rate-limiter.ts          # Rate limiting for outbound calls
```

### Pattern 1: Provider Plugin Interface

**What:** Define a TypeScript interface that all webhook providers must implement, enabling dynamic loading and type safety.

**When to use:** Core pattern for the entire provider system.

**Example:**
```typescript
// Source: Based on TypeScript plugin architecture patterns (DEV Community, Codeless Code)

// Provider configuration interface
interface WebhookProviderConfig {
  type: 'github' | 'jira';
  secretLocation: 'database' | 'ssm' | 'env';
  secretPath?: string;
  algorithm: 'sha256' | 'sha1';
  allowedEvents: string[];
}

// Parsed webhook event
interface ParsedWebhookEvent {
  provider: string;
  eventType: string;
  deduplicationId: string;      // Provider-specific unique ID
  timestamp: string;
  payload: unknown;
  metadata: {
    projectId?: string;
    repositoryId?: string;
    issueKey?: string;
  };
}

// Outbound result interface
interface WebhookResult {
  success: boolean;
  action: 'comment' | 'label_update' | 'status_update';
  targetId: string;
  details?: string;
}

// Base provider interface
export abstract class WebhookProvider {
  abstract readonly name: string;
  abstract readonly config: WebhookProviderConfig;

  // Parse incoming webhook payload into standardized format
  abstract parseEvent(payload: unknown, headers: Record<string, string>): ParsedWebhookEvent;

  // Verify webhook signature
  abstract verifySignature(payload: Buffer, signature: string, secret: string): boolean;

  // Post result back to platform (comment, label update, etc.)
  abstract postResult(ticketId: string, result: WebhookResult): Promise<void>;

  // Get supported event types
  abstract getSupportedEvents(): string[];

  // Validate configuration
  abstract validateConfig(config: WebhookProviderConfig): boolean;
}
```

### Pattern 2: Generic Signature Validator

**What:** A configurable HMAC signature validator supporting multiple algorithms and secret sources.

**When to use:** All incoming webhook requests require signature verification.

**Example:**
```typescript
// Source: GitHub official docs - Validating webhook deliveries
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

import crypto from 'crypto';

interface SignatureValidatorConfig {
  algorithm: 'sha256' | 'sha1';
  headerName: string;           // e.g., 'x-hub-signature-256'
  prefix: string;               // e.g., 'sha256='
  secretLocation: 'database' | 'ssm' | 'env';
}

export class SignatureValidator {
  constructor(private config: SignatureValidatorConfig) {}

  async getSecret(projectId: string): Promise<string> {
    // Fetch from configured location (database, SSM, or env)
    switch (this.config.secretLocation) {
      case 'database':
        return await this.getSecretFromDatabase(projectId);
      case 'ssm':
        return await this.getSecretFromSSM(projectId);
      case 'env':
        return process.env.WEBHOOK_SECRET || '';
    }
  }

  verify(payload: Buffer, signature: string, secret: string): boolean {
    // Strip prefix if present
    const receivedSignature = signature.replace(this.config.prefix, '');

    // Compute expected signature
    const hmac = crypto.createHmac(this.config.algorithm, secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // CRITICAL: Use timing-safe comparison to prevent timing attacks
    // Source: GitHub docs explicitly warn against using ==
    const receivedBuf = Buffer.from(receivedSignature, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');

    // Ensure buffers are same length before comparison
    if (receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  }

  private async getSecretFromDatabase(projectId: string): Promise<string> {
    // Implementation using Kysely
    return '';
  }

  private async getSecretFromSSM(projectId: string): Promise<string> {
    // Implementation using AWS SDK
    return '';
  }
}
```

### Pattern 3: Provider Registry with Dynamic Loading

**What:** A registry pattern that loads providers dynamically from a directory, enabling hot-reloading in development and easy addition of new providers.

**When to use:** Core provider management system.

**Example:**
```typescript
// Source: Designing a Plugin System in TypeScript (DEV Community, April 2025)
// https://dev.to/hexshift/designing-a-plugin-system-in-typescript-for-modular-web-applications-4db5

import path from 'path';
import { promises as fs } from 'fs';
import { WebhookProvider } from './base-provider';

export class ProviderRegistry {
  private providers = new Map<string, WebhookProvider>();

  async loadProvidersFromDirectory(providerDir: string) {
    const files = await fs.readdir(providerDir);

    for (const file of files) {
      if (file.endsWith('-provider.ts')) {
        const modulePath = path.join(providerDir, file);
        const module = await import(modulePath);
        const ProviderClass = module.default || module[Object.keys(module)[0]];

        if (ProviderClass && typeof ProviderClass === 'function') {
          const provider = new ProviderClass();
          this.providers.set(provider.name, provider);
        }
      }
    }
  }

  register(provider: WebhookProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: string): WebhookProvider | undefined {
    return this.providers.get(name);
  }

  getProviderForHeaders(headers: Record<string, string>): WebhookProvider | undefined {
    // Route to appropriate provider based on headers
    // GitHub: x-github-event
    // Jira: x-atlassian-webhook-identifier or webhookEvent in body
    if (headers['x-github-event']) {
      return this.get('github');
    }
    if (headers['x-atlassian-webhook-identifier']) {
      return this.get('jira');
    }
    return undefined;
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
```

### Pattern 4: Express Middleware for Signature Verification

**What:** Raw body parsing middleware combined with signature verification before JSON parsing.

**When to use:** All webhook endpoints.

**Example:**
```typescript
// Source: GitHub webhook verification best practices + Jira webhook guide
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
// https://inventivehq.com/blog/jira-webhooks-guide

import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SignatureValidator } from './validator';

interface ExtendedRequest extends Request {
  rawBody?: Buffer;
}

// CRITICAL: Use raw body parser for webhook routes
// Standard body-parser will mutate the body, breaking signature verification
export function rawBodyMiddleware() {
  return express.raw({
    type: 'application/json',
    limit: '10mb',
  });
}

export function createSignatureMiddleware(validator: SignatureValidator) {
  return async (req: ExtendedRequest, res: Response, next: NextFunction) => {
    const signature = req.headers['x-hub-signature-256'] as string ||
                      req.headers['x-hub-signature'] as string ||
                      req.headers['x-hub-signature'] as string; // Jira

    if (!signature) {
      return res.status(401).json({ error: 'Missing signature header' });
    }

    // Store raw body for verification
    const rawBody = req.body;

    // Get project ID from request (e.g., from path parameter or header)
    const projectId = req.headers['x-project-id'] as string || 'default';

    try {
      const secret = await validator.getSecret(projectId);
      const isValid = validator.verify(rawBody, signature, secret);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Replace raw body with parsed JSON for next middleware
      try {
        req.body = JSON.parse(rawBody.toString('utf8'));
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }

      next();
    } catch (error) {
      console.error('Signature verification error:', error);
      return res.status(500).json({ error: 'Signature verification failed' });
    }
  };
}
```

### Anti-Patterns to Avoid
- **Using standard string comparison (`===` or `==`) for signatures**: Opens application to timing attacks where an attacker can incrementally guess the correct signature. Use `crypto.timingSafeEqual()` instead.
- **Parsing JSON before signature verification**: Body parsing mutates the request body, causing signature verification to fail. Always verify against raw bytes first.
- **Skipping idempotency checks**: Webhook providers retry on failures. Without idempotency, the same event will be processed multiple times.
- **Hardcoding secrets in code**: Credentials should be fetched from secure storage (database, SSM, or environment variables).
- **Synchronous processing of webhook handlers**: Long-running operations will cause webhook timeouts. Use job queues for async processing.
- **Not validating event types before processing**: Process only subscribed events to avoid unexpected behavior.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC signature verification | Custom crypto logic | Node.js built-in `crypto` module with `timingSafeEqual()` | Timing-safe comparison is critical for security; subtle bugs are common |
| Idempotency tracking | Custom in-memory tracking | Database with unique constraint on `deduplication_id` | In-memory doesn't survive restarts; database provides durability and deduplication |
| Rate limiting for outbound APIs | Custom request throttling | `axios-rate-limit` or token bucket algorithm | Proper rate limiting requires backoff strategy and retry handling |
| Webhook body parsing | Custom parsers | Express `express.raw()` middleware | Raw body parsing is required for signature verification |
| Secret management | Environment variables only | AWS SSM Parameter Store or HashiCorp Vault for cloud | Database-backed for local, SSM for cloud provides flexibility |

**Key insight:** Signature verification security pitfalls are the most dangerous to hand-roll. Timing attacks can reveal secrets byte-by-byte, and this is not theoretical—GitHub explicitly warns against standard comparison in their official documentation.

## Common Pitfalls

### Pitfall 1: Timing Attack Vulnerability in Signature Verification

**What goes wrong:** Using standard string comparison (`===`, `==`, or `Buffer.equals()`) for HMAC signature verification allows attackers to use timing side-channels to guess valid signatures.

**Why it happens:** Standard string comparison returns false as soon as a mismatching character is found. Attackers can measure response times to determine how many characters match, then iteratively guess the signature.

**How to avoid:** Always use `crypto.timingSafeEqual()` for signature comparison. This function compares all bytes regardless of differences, preventing timing leaks.

**Warning signs:**
- Signature verification using `signature === expectedSignature`
- Using `Buffer.compare()` or standard equality for HMAC results
- GitHub docs explicitly warn: "Never use a plain == operator"

### Pitfall 2: Signature Verification Fails Due to Body Parsing

**What goes wrong:** Signature verification fails even with correct secret because the request body was modified by Express body-parser before verification.

**Why it happens:** Standard `express.json()` middleware parses and mutates the request body. The signature was computed on the raw bytes, but verification is done on the parsed/modified object.

**How to avoid:** Use `express.raw({ type: 'application/json' })` middleware to capture raw body, verify signature against raw bytes, then parse JSON manually.

**Warning signs:**
- Signature validation passes in tests but fails in production
- Using `express.json()` before signature verification
- Verification works with curl but fails from actual webhooks

### Pitfall 3: Duplicate Event Processing

**What goes wrong:** The same webhook event is processed multiple times, causing duplicate tickets, API calls, or notifications.

**Why it happens:** Webhook providers retry failed deliveries. Without idempotency handling, retries create duplicate actions. Jira retries up to 5 times, GitHub has similar retry behavior.

**How to avoid:** Track processed webhook IDs using the provider's deduplication identifier (`X-GitHub-Delivery` for GitHub, `X-Atlassian-Webhook-Identifier` for Jira) in a database with unique constraints.

**Warning signs:**
- Duplicate issues created in external systems
- Same comment posted multiple times
- Users report receiving multiple notifications for single events

### Pitfall 4: Webhook Timeout Due to Synchronous Processing

**What goes wrong:** Webhook endpoints timeout (30s for GitHub primary, 15 minutes for secondary) because processing takes too long.

**Why it happens:** Business logic, database operations, or outbound API calls are executed synchronously in the webhook handler.

**How to avoid:** Return 200 OK immediately, then process webhooks asynchronously using a job queue (Bull, BullMQ) or background worker.

**Warning signs:**
- Jira/GitHub webhook logs showing timeouts
- Processing sometimes succeeds, sometimes fails
- Long-running operations in webhook handlers

### Pitfall 5: Signature Replay Attacks

**What goes wrong:** Attacker captures and re-sends a valid webhook request, triggering unauthorized actions.

**Why it happens:** Signatures remain valid indefinitely; without timestamp validation, old signed requests can be replayed.

**How to avoid:** Reject webhooks older than a configured time window (e.g., 5-10 minutes) by checking the timestamp field in the payload. Combine with deduplication tracking for comprehensive protection.

**Warning signs:**
- Webhook events processed with very old timestamps
- Suspicious activity patterns in logs
- No timestamp validation in signature verification

### Pitfall 6: Rate Limiting on Outbound API Calls

**What goes wrong:** Outbound calls to GitHub/Jira APIs fail due to rate limiting after processing multiple webhooks.

**Why it happens:** Each webhook may trigger outbound API calls (comments, label updates). High webhook volume can exceed rate limits (GitHub: 5,000 requests/hour authenticated; Jira: new rate limits starting Nov 2025).

**How to avoid:** Implement rate limiting and exponential backoff for outbound API calls. Use batch operations where available. Monitor rate limit headers and queue requests when limits are approached.

**Warning signs:**
- HTTP 429 responses from GitHub/Jira APIs
- "Rate limit exceeded" errors
- Failures during high webhook volume periods

## Code Examples

Verified patterns from official sources:

### GitHub Signature Verification (Node.js)

```typescript
// Source: GitHub official documentation - Validating webhook deliveries
// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

import crypto from 'crypto';

export function verifyGitHubSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  const signatureParts = signatureHeader.split('=');
  const algorithm = signatureParts[0];
  const signatureHash = signatureParts[1];

  // Only support SHA-256 (recommended by GitHub)
  if (algorithm !== 'sha256') {
    return false;
  }

  // Compute HMAC
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedHash = hmac.digest('hex');

  // CRITICAL: Use timing-safe comparison
  const signatureBuf = Buffer.from(signatureHash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');

  if (signatureBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuf, expectedBuf);
}
```

### Jira Webhook Event Parsing

```typescript
// Source: Jira webhook event types from Atlassian docs
// https://developer.atlassian.com/cloud/jira/platform/modules/webhook/

interface JiraWebhookPayload {
  timestamp: number;
  webhookEvent: string;
  issue_event_type_name?: string;
  user: {
    accountId: string;
    displayName: string;
    emailAddress?: string;
  };
  issue?: {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      project: { id: string; key: string; name: string };
      issuetype: { name: string };
      labels: string[];
      components: Array<{ id: string; name: string }>;
    };
  };
  changelog?: {
    items: Array<{
      field: string;
      fromString?: string;
      toString?: string;
    }>;
  };
}

export function parseJiraWebhook(
  payload: unknown,
  headers: Record<string, string>
): ParsedWebhookEvent {
  const data = payload as JiraWebhookPayload;

  return {
    provider: 'jira',
    eventType: data.webhookEvent,
    deduplicationId: headers['x-atlassian-webhook-identifier'] || `${data.timestamp}-${data.issue?.id}`,
    timestamp: new Date(data.timestamp).toISOString(),
    payload: data,
    metadata: {
      projectId: data.issue?.fields.project.id,
      issueKey: data.issue?.key,
    },
  };
}
```

### GitHub Webhook Event Parsing

```typescript
// Source: GitHub webhook events and payloads
// https://docs.github.com/en/webhooks/webhook-events-and-payloads

interface GitHubWebhookPayload {
  action?: string;
  issue?: {
    id: number;
    number: number;
    title: string;
    state: string;
    labels: Array<{ name: string }>;
    user: { login: string };
    created_at: string;
    updated_at: string;
    html_url: string;
  };
  repository?: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  };
  sender?: {
    login: string;
  };
}

export function parseGitHubWebhook(
  payload: unknown,
  headers: Record<string, string>
): ParsedWebhookEvent {
  const data = payload as GitHubWebhookPayload;
  const eventType = headers['x-github-event'] as string;

  return {
    provider: 'github',
    eventType,
    deduplicationId: headers['x-github-delivery'] || `${eventType}-${data.issue?.id}`,
    timestamp: data.issue?.updated_at || new Date().toISOString(),
    payload: data,
    metadata: {
      repositoryId: data.repository?.full_name,
      issueKey: data.issue?.number.toString(),
    },
  };
}
```

### Idempotency Check Middleware

```typescript
// Source: Webhook idempotency best practices
// https://hookdeck.com/blog/webhooks-at-scale

import { Request, Response, NextFunction } from 'express';
import { db } from '../database';

export async function idempotencyCheck(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const deduplicationId = req.headers['x-deduplication-id'] as string ||
                           req.headers['x-github-delivery'] as string ||
                           req.headers['x-atlassian-webhook-identifier'] as string;

  if (!deduplicationId) {
    return res.status(400).json({ error: 'Missing deduplication ID' });
  }

  try {
    // Check if already processed
    const existing = await db
      .selectFrom('webhook_events')
      .where('deduplication_id', '=', deduplicationId)
      .executeTakeFirst();

    if (existing) {
      return res.status(200).json({
        message: 'Event already processed',
        eventId: existing.id,
        duplicate: true,
      });
    }

    // Mark as processing (insert record)
    await db
      .insertInto('webhook_events')
      .values({
        deduplication_id: deduplicationId,
        provider: req.body.provider,
        event_type: req.body.eventType,
        payload: req.body.payload,
        processed: false,
        created_at: new Date(),
      })
      .execute();

    next();
  } catch (error) {
    console.error('Idempotency check error:', error);
    return res.status(500).json({ error: 'Idempotency check failed' });
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SHA-1 signatures (X-Hub-Signature) | SHA-256 signatures (X-Hub-Signature-256) | GitHub: 2021+ | Use X-Hub-Signature-256; X-Hub-Signature is legacy only |
| No signature verification (Jira) | HMAC-SHA256 optional (Jira Feb 2024+) | February 2024 | Jira now supports X-Hub-Signature header |
| Synchronous webhook processing | Async with job queues | Industry standard since ~2020 | Prevents timeouts, improves reliability |
| Basic signature comparison | Timing-safe comparison | Security best practice | Prevents timing attack vulnerabilities |
| Polling for updates | Webhook push notifications | Industry standard | Reduces API load, enables real-time updates |

**Deprecated/outdated:**
- **X-Hub-Signature (SHA-1)**: GitHub recommends X-Hub-Signature-256 (SHA-256) only; SHA-1 is legacy
- **Plain string comparison for signatures**: Vulnerable to timing attacks; use timing-safe comparison
- **Parsing JSON before signature verification**: Breaks signature validation; use raw body
- **No idempotency handling**: Webhooks retry; idempotency is required for reliability

**Upcoming changes:**
- **Jira API Token Rate Limiting**: Starting November 22, 2025, Atlassian implements rate limits for API tokens
- **GitHub Events API payload changes**: August 8, 2025 - GitHub trimming fields to reduce payload size

## Open Questions

1. **Secret rotation strategy**
   - What we know: Secrets should be rotated periodically for security
   - What's unclear: How to handle rotation gracefully for active webhooks
   - Recommendation: Store secret versions in database, support multiple valid secrets during rotation window

2. **Webhook ordering guarantees**
   - What we know: Neither GitHub nor Jira guarantee webhook delivery order
   - What's unclear: Whether the system needs strict ordering for certain operations
   - Recommendation: Design handlers to be order-independent; use timestamp fields for ordering when needed

3. **Failed webhook retry strategy**
   - What we know: Manual retry is specified in requirements
   - What's unclear: Whether automatic retry with exponential backoff should also be implemented
   - Recommendation: Store failed events with error details; provide UI for manual retry; consider automatic retry for transient failures

## Sources

### Primary (HIGH confidence)
- [GitHub Webhook Documentation - Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) - Official HMAC-SHA256 verification with timing-safe comparison
- [GitHub Webhook Events and Payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads) - Complete webhook event reference
- [Atlassian Jira Webhook Modules](https://developer.atlassian.com/cloud/jira/platform/modules/webhook/) - Official Jira webhook event types
- [Designing a Plugin System in TypeScript](https://dev.to/hexshift/designing-a-plugin-system-in-typescript-for-modular-web-applications-4db5) - April 2025 plugin architecture patterns
- [Towards a well-typed plugin architecture](https://code.lol/post/programming/plugin-architecture/) - TypeScript plugin system with dependency enforcement

### Secondary (MEDIUM confidence)
- [Jira Webhooks: Complete Guide with Payload Examples](https://inventivehq.com/blog/jira-webhooks-guide) - January 24, 2025 comprehensive guide with verified code examples
- [Webhooks at Scale: Best Practices and Lessons Learned](https://hookdeck.com/blog/webhooks-at-scale) - Idempotency and scalability patterns
- [Webhook Security Best Practices](https://webflow.com/blog/webhook-security) - Timestamp validation and replay attack prevention
- [How to Apply Webhook Best Practices](https://www.integrate.io/blog/apply-webhook-best-practices/) - October 2025 delivery ID and upsert patterns

### Tertiary (LOW confidence)
- [Plugin Based Architecture in Node.js](https://www.n-school.com/plugin-based-architecture-in-node-js/) - May 14, 2025 general plugin patterns (marked for validation)
- Various GitHub community discussions on webhook implementation (verified against official docs where applicable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All based on official documentation and widely-used libraries
- Architecture: HIGH - Plugin patterns verified with 2025 sources; TypeScript patterns from code.lol with detailed examples
- Signature verification: HIGH - Directly from GitHub official documentation with explicit warnings
- Pitfalls: HIGH - Multiple authoritative sources agree on timing attacks, idempotency, and body parsing issues

**Research date:** 2026-01-22
**Valid until:** 2026-02-21 (30 days - webhook documentation is relatively stable; monitor for GitHub/Jira API changes)
