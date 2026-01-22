# Phase 8: Webhook Provider Architecture - Research

**Researched:** 2026-01-22
**Domain:** Webhook integration, GitHub API, Provider patterns
**Confidence:** HIGH

## Summary

This phase implements a provider-agnostic webhook integration system with GitHub as the first implementation. Research covered webhook signature verification (HMAC-SHA256 for GitHub/Bitbucket, simple token for GitLab), provider interface patterns from established projects like Woodpecker CI, GitHub webhook payload structures, deduplication strategies, and integration patterns with existing codebase services.

The codebase already has partial webhook infrastructure in `platform/backend/src/api/routes/webhooks.ts` and `GitHubIntegration.ts` that can be refactored into the new provider architecture. The existing `CredentialProviderFactory` pattern provides an excellent template for the webhook provider factory.

**Primary recommendation:** Implement a `WebhookProvider` interface with `validateSignature`, `parseEvent`, `postComment`, and `updateLabels` methods. Use content-based SHA-256 hashing for deduplication with a 24-hour TTL window stored in PostgreSQL.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js crypto | built-in | HMAC-SHA256 signature validation | Native, no dependencies, used in existing codebase |
| crypto.timingSafeEqual | built-in | Timing-safe signature comparison | Prevents timing attacks, already used in webhooks.ts |
| crypto.randomUUID | built-in | UUID generation | Already established pattern in codebase |
| axios | ^1.x | HTTP client for outbound API calls | Already used in GitHubIntegration.ts |
| Joi | ^17.x | Request validation | Already used in validation middleware |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Kysely | existing | Database queries | All DB operations - matches codebase pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual HMAC | github-webhook-handler npm | Extra dependency for simple use case |
| PostgreSQL dedup | Redis | Adds operational complexity for simple TTL cache |
| Joi validation | Zod | Joi already established in codebase |

**Installation:**
```bash
# No new dependencies needed - all core libraries already in project
```

## Architecture Patterns

### Recommended Project Structure
```
platform/backend/src/
├── webhooks/
│   ├── WebhookProvider.ts           # Provider interface
│   ├── WebhookProviderFactory.ts    # Factory for creating providers
│   ├── WebhookService.ts            # Orchestrates webhook processing
│   ├── WebhookDeduplicationService.ts # Handles deduplication
│   ├── providers/
│   │   ├── GitHubWebhookProvider.ts # GitHub implementation
│   │   ├── GitLabWebhookProvider.ts # GitLab implementation (future)
│   │   └── BitbucketWebhookProvider.ts # Bitbucket implementation (future)
│   └── types.ts                     # Webhook-specific types
├── persistence/
│   └── webhooks/
│       ├── WebhookConfigDAO.ts      # Webhook configuration storage
│       └── WebhookFailedEventDAO.ts # Failed event storage for retry
```

### Pattern 1: Provider Interface
**What:** Abstract interface defining webhook provider contract
**When to use:** All webhook providers must implement this interface
**Example:**
```typescript
// Source: Modeled after existing CredentialProvider.ts pattern
export interface WebhookProvider {
  readonly name: string;
  readonly providerType: 'github' | 'gitlab' | 'bitbucket';

  // Inbound: Receiving webhooks
  validateSignature(payload: string, signature: string, secret: string): boolean;
  parseEvent(headers: Record<string, string>, payload: unknown): WebhookEvent | null;

  // Outbound: Responding to platform
  postComment(config: ProviderConfig, issueId: string, body: string): Promise<void>;
  updateLabels(config: ProviderConfig, issueId: string, add: string[], remove: string[]): Promise<void>;

  // Configuration
  getSetupInstructions(webhookUrl: string): WebhookSetupInstructions;
}

export interface WebhookEvent {
  deliveryId: string;              // X-GitHub-Delivery / X-Hook-UUID
  eventType: string;               // issues, issue_comment, etc.
  action: string;                  // opened, created, etc.
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  issue?: {
    number: number;
    title: string;
    body: string;
    labels: string[];
    url: string;
  };
  comment?: {
    id: number;
    body: string;
    author: string;
  };
  sender: {
    login: string;
  };
  rawPayload: unknown;
}
```

### Pattern 2: Signature Validation by Provider
**What:** Each provider has different signature mechanisms
**When to use:** During webhook request validation
**Example:**
```typescript
// GitHub: HMAC-SHA256 signature
// Source: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
export class GitHubWebhookProvider implements WebhookProvider {
  validateSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex')}`;

    // CRITICAL: Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

// GitLab: Simple token comparison
// Source: https://docs.gitlab.com/user/project/integrations/webhooks/
export class GitLabWebhookProvider implements WebhookProvider {
  validateSignature(_payload: string, token: string, secret: string): boolean {
    if (!token || !secret) return false;
    // GitLab sends secret in X-Gitlab-Token header (not HMAC)
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(secret)
    );
  }
}

// Bitbucket: HMAC-SHA256 signature (similar to GitHub)
// Source: https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/
export class BitbucketWebhookProvider implements WebhookProvider {
  validateSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
```

### Pattern 3: Event Parsing with @bot Detection
**What:** Parse webhook payload and detect bot mentions
**When to use:** When processing issue_comment events
**Example:**
```typescript
// Source: Based on CONTEXT.md decisions for @bot mentions
export function detectBotMention(body: string, botUsername: string): boolean {
  // Match @bot or @botname at word boundaries
  const pattern = new RegExp(`@${botUsername}\\b`, 'i');
  return pattern.test(body);
}

export function extractIntent(body: string, botUsername: string): string | null {
  // Extract text after @bot mention
  const pattern = new RegExp(`@${botUsername}\\s+(.+?)(?:\\n|$)`, 'i');
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

// In GitHubWebhookProvider.parseEvent():
parseEvent(headers: Record<string, string>, payload: unknown): WebhookEvent | null {
  const eventType = headers['x-github-event'];
  const deliveryId = headers['x-github-delivery'];

  if (!eventType || !deliveryId) return null;

  const data = payload as GitHubWebhookPayload;

  // Only process issues and issue_comment events
  if (eventType !== 'issues' && eventType !== 'issue_comment') {
    return null;
  }

  // For comments, check for @bot mention
  if (eventType === 'issue_comment' && data.comment) {
    const botUsername = 'viberator'; // configurable
    if (!detectBotMention(data.comment.body, botUsername)) {
      return null; // Ignore comments without @bot mention
    }
  }

  return {
    deliveryId,
    eventType,
    action: data.action,
    repository: {
      owner: data.repository.owner.login,
      name: data.repository.name,
      fullName: data.repository.full_name,
    },
    issue: data.issue ? {
      number: data.issue.number,
      title: data.issue.title,
      body: data.issue.body || '',
      labels: data.issue.labels?.map(l => l.name) || [],
      url: data.issue.html_url,
    } : undefined,
    comment: data.comment ? {
      id: data.comment.id,
      body: data.comment.body,
      author: data.comment.user.login,
    } : undefined,
    sender: {
      login: data.sender.login,
    },
    rawPayload: payload,
  };
}
```

### Pattern 4: Deduplication Service
**What:** Prevent duplicate processing of webhooks
**When to use:** Before processing any webhook event
**Example:**
```typescript
// Source: https://hookdeck.com/webhooks/guides/implement-webhook-idempotency
export class WebhookDeduplicationService {
  private static readonly DEDUP_TTL_HOURS = 24;

  async isDuplicate(event: WebhookEvent): Promise<boolean> {
    const hash = this.computeHash(event);

    // Check if hash exists within TTL window
    const existing = await db
      .selectFrom('webhook_deduplication')
      .select('id')
      .where('hash', '=', hash)
      .where('created_at', '>', this.getTtlCutoff())
      .executeTakeFirst();

    return !!existing;
  }

  async markProcessed(event: WebhookEvent): Promise<void> {
    const hash = this.computeHash(event);

    await db
      .insertInto('webhook_deduplication')
      .values({
        id: crypto.randomUUID(),
        hash,
        delivery_id: event.deliveryId,
        event_type: event.eventType,
        created_at: new Date(),
      })
      .onConflict((oc) => oc.column('hash').doNothing())
      .execute();
  }

  private computeHash(event: WebhookEvent): string {
    // Hash immutable fields: deliveryId + eventType + action + repo + issue/comment
    const data = JSON.stringify({
      deliveryId: event.deliveryId,
      eventType: event.eventType,
      action: event.action,
      repository: event.repository.fullName,
      issueNumber: event.issue?.number,
      commentId: event.comment?.id,
    });

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private getTtlCutoff(): Date {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - WebhookDeduplicationService.DEDUP_TTL_HOURS);
    return cutoff;
  }
}
```

### Anti-Patterns to Avoid
- **Plain string comparison for signatures:** Always use `crypto.timingSafeEqual` to prevent timing attacks
- **Parsing body after JSON.stringify:** GitHub signs the raw body, not the re-serialized JSON
- **Processing webhooks synchronously with long operations:** Return 200 quickly, process async if needed
- **Single global webhook secret:** Use per-project secrets for better security isolation

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC signature | Manual byte comparison | crypto.timingSafeEqual | Timing attack prevention |
| UUID generation | substr(random) | crypto.randomUUID() | Cryptographically secure |
| HTTP client | fetch wrapper | axios (existing) | Already established in codebase |
| Validation | Manual checks | Joi schemas | Consistent with codebase patterns |
| Deduplication | In-memory cache | PostgreSQL table | Survives restarts, shared across instances |

**Key insight:** The codebase already has well-established patterns for factories (CredentialProviderFactory), validation (Joi schemas), and database access (Kysely). Follow these patterns rather than inventing new ones.

## Common Pitfalls

### Pitfall 1: Raw Body Access for Signature Verification
**What goes wrong:** Express parses JSON body, signature verification fails because body was re-serialized
**Why it happens:** GitHub signs the raw request body, not the JSON-parsed-then-stringified version
**How to avoid:** Use `express.raw()` or `express.json({ verify: (req, res, buf) => req.rawBody = buf })`
**Warning signs:** Signature validation fails even with correct secret

### Pitfall 2: Webhook Timeout
**What goes wrong:** GitHub/GitLab retry webhook because endpoint took too long
**Why it happens:** Processing ticket creation, job execution inline with webhook request
**How to avoid:** Return 200 immediately after validation, process asynchronously
**Warning signs:** Duplicate webhooks, multiple jobs created for same event

### Pitfall 3: Missing Delivery ID Deduplication
**What goes wrong:** Same webhook processed multiple times during retries
**Why it happens:** Webhook providers retry on timeout/5xx, but delivery ID is the same
**How to avoid:** Store and check X-GitHub-Delivery / X-Hook-UUID before processing
**Warning signs:** Duplicate tickets/jobs for single GitHub event

### Pitfall 4: Secret Storage Security
**What goes wrong:** Webhook secrets exposed in logs, config files, or database dumps
**Why it happens:** Treating secrets like regular config
**How to avoid:** Use CredentialProvider for secret storage, never log secrets
**Warning signs:** Secrets visible in application logs or config dumps

### Pitfall 5: Event Type Confusion
**What goes wrong:** Processing wrong event type or missing events
**Why it happens:** GitHub sends many event types, not all relevant
**How to avoid:** Explicit allowlist of event types to process (issues, issue_comment)
**Warning signs:** Jobs created for irrelevant events like label changes

## Code Examples

Verified patterns from official sources:

### GitHub Webhook Headers
```typescript
// Source: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
interface GitHubWebhookHeaders {
  'x-hub-signature-256': string;  // sha256=<hex digest>
  'x-github-event': string;       // issues, issue_comment, push, etc.
  'x-github-delivery': string;    // unique delivery UUID
  'x-github-hook-id': string;     // webhook config ID
  'x-github-hook-installation-target-id': string;
  'x-github-hook-installation-target-type': string; // repository, organization
}
```

### GitHub Issue Event Payload
```typescript
// Source: https://docs.github.com/en/webhooks/webhook-events-and-payloads#issues
interface GitHubIssuePayload {
  action: 'opened' | 'edited' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled';
  issue: {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    labels: Array<{ name: string; color: string }>;
    assignee: { login: string } | null;
    html_url: string;
    created_at: string;
    updated_at: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    html_url: string;
  };
  sender: {
    login: string;
    id: number;
  };
}
```

### GitHub Issue Comment Event Payload
```typescript
// Source: https://docs.github.com/en/webhooks/webhook-events-and-payloads#issue_comment
interface GitHubIssueCommentPayload {
  action: 'created' | 'edited' | 'deleted';
  issue: {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    labels: Array<{ name: string; color: string }>;
    html_url: string;
    // Note: pull_request key exists if this is a PR comment
    pull_request?: { url: string };
  };
  comment: {
    id: number;
    body: string;
    user: { login: string };
    created_at: string;
    html_url: string;
  };
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  };
  sender: {
    login: string;
  };
}
```

### GitHub API: Post Comment
```typescript
// Source: https://docs.github.com/en/rest/issues/comments
async postComment(config: GitHubConfig, issueNumber: number, body: string): Promise<void> {
  await axios.post(
    `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
    { body },
    {
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'viberator/1.0',
      },
    }
  );
}
```

### GitHub API: Update Labels
```typescript
// Source: https://docs.github.com/en/rest/issues/labels
async updateLabels(
  config: GitHubConfig,
  issueNumber: number,
  add: string[],
  remove: string[]
): Promise<void> {
  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${issueNumber}/labels`;
  const headers = {
    Authorization: `token ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'viberator/1.0',
  };

  // Add labels
  if (add.length > 0) {
    await axios.post(baseUrl, { labels: add }, { headers });
  }

  // Remove labels one by one
  for (const label of remove) {
    await axios.delete(`${baseUrl}/${encodeURIComponent(label)}`, { headers });
  }
}
```

### Express Raw Body Middleware
```typescript
// Capture raw body for signature verification while still parsing JSON
app.use('/api/webhooks', express.json({
  verify: (req: Request, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  }
}));
```

## Database Schema

### New Tables Required

```sql
-- Webhook provider configuration (per-project or tenant-wide default)
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  provider_type VARCHAR(20) NOT NULL CHECK (provider_type IN ('github', 'gitlab', 'bitbucket')),
  secret_key VARCHAR(255) NOT NULL, -- Reference to secret in CredentialProvider
  bot_username VARCHAR(100),
  auto_execute BOOLEAN DEFAULT false,
  default_clanker_id UUID REFERENCES clankers(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, provider_type)
);

-- Webhook deduplication tracking
CREATE TABLE webhook_deduplication (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash VARCHAR(64) NOT NULL UNIQUE,
  delivery_id VARCHAR(100),
  event_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for TTL cleanup queries
CREATE INDEX idx_webhook_dedup_created_at ON webhook_deduplication(created_at);

-- Failed webhook events for manual retry
CREATE TABLE webhook_failed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  provider_type VARCHAR(20) NOT NULL,
  delivery_id VARCHAR(100),
  event_type VARCHAR(50),
  headers JSONB NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_retry_at TIMESTAMP
);

-- Index for finding failed events to retry
CREATE INDEX idx_webhook_failed_project ON webhook_failed_events(project_id, created_at);
```

### Existing Tables to Leverage
- `webhook_events` - Already exists for audit logging
- `tickets` - For creating tickets from webhooks
- `jobs` - For auto-execution
- `projects` - Repository mapping already has repository_url

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SHA1 signatures | SHA256 signatures | 2021 | X-Hub-Signature deprecated, use X-Hub-Signature-256 |
| Polling for updates | Webhooks | N/A | Real-time updates, reduced API calls |
| Single webhook endpoint | Provider-specific endpoints | N/A | Better separation, type-safe handling |

**Deprecated/outdated:**
- `X-Hub-Signature` header (SHA1): Use `X-Hub-Signature-256` instead
- GitLab token-only auth: Consider enabling URL signing for additional security

## Open Questions

Things that couldn't be fully resolved:

1. **Bot username configuration**
   - What we know: @bot mentions need a configurable username
   - What's unclear: Should this be tenant-wide or per-project?
   - Recommendation: Start with tenant-wide default, allow project override

2. **Label-based clanker override**
   - What we know: CONTEXT.md mentions labels can override clanker selection
   - What's unclear: Exact label format (e.g., `clanker:slug` vs `use-clanker-X`)
   - Recommendation: Use `viberator:clanker-<slug>` format for clarity

3. **Rate limiting on outbound calls**
   - What we know: GitHub API has rate limits, posting comments triggers notifications
   - What's unclear: Exact rate limit handling strategy
   - Recommendation: Log rate limit warnings, implement basic backoff

## Integration Points

### TicketService Integration
The webhook handler will create tickets using existing `TicketDAO`:
```typescript
// Create ticket from webhook event
const ticket = await ticketDAO.createTicket({
  projectId: webhookConfig.projectId,
  title: event.issue.title,
  description: event.issue.body || event.comment?.body || '',
  severity: 'medium', // Default, could be derived from labels
  category: 'webhook',
  metadata: { source: 'github', issueNumber: event.issue.number },
  ticketSystem: 'github',
  autoFixRequested: webhookConfig.autoExecute,
});
```

### WorkerExecutionService Integration
For auto-execution, leverage existing service:
```typescript
// After ticket creation, if auto-execute enabled
if (webhookConfig.autoExecute && webhookConfig.defaultClankerId) {
  const job = await jobService.submitJob({
    tenantId: project.tenantId,
    repository: project.repositoryUrl,
    task: ticket.description,
    // ...
  }, {
    ticketId: ticket.id,
    clankerId: webhookConfig.defaultClankerId,
  });

  await workerExecutionService.executeJob(job, clanker);
}
```

### Existing Webhooks Route Refactoring
The current `webhooks.ts` will be refactored to use the new provider architecture:
```typescript
// Before: Hardcoded GitHub handling
router.post('/github', verifyGitHubSignature, async (req, res) => { ... });

// After: Provider-agnostic with factory
router.post('/:provider', async (req, res) => {
  const provider = webhookProviderFactory.getProvider(req.params.provider);
  // ... unified handling
});
```

## Sources

### Primary (HIGH confidence)
- GitHub Webhooks Documentation - Signature validation, event payloads, headers
  - https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
  - https://docs.github.com/en/webhooks/webhook-events-and-payloads
- GitHub REST API - Issues, Comments, Labels
  - https://docs.github.com/en/rest/issues/comments
  - https://docs.github.com/en/rest/issues/labels

### Secondary (MEDIUM confidence)
- GitLab Webhooks Documentation - Token-based verification, event types
  - https://docs.gitlab.com/user/project/integrations/webhooks/
- Bitbucket Webhooks Documentation - HMAC signature verification
  - https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/
- Hookdeck Webhook Best Practices - Deduplication, idempotency patterns
  - https://hookdeck.com/webhooks/guides/implement-webhook-idempotency
- Woodpecker CI Forge Abstraction - Provider interface patterns
  - https://deepwiki.com/woodpecker-ci/woodpecker/4.1-authentication-and-authorization

### Tertiary (LOW confidence)
- Various Medium/blog posts on webhook best practices
  - https://medium.com/@kaushalsinh73/top-7-webhook-reliability-tricks-for-idempotency-a098f3ef5809
  - https://release.com/blog/webhook-authentication-learnings

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only existing codebase dependencies
- Architecture: HIGH - Based on existing CredentialProvider pattern
- GitHub integration: HIGH - Based on official documentation
- Pitfalls: HIGH - Verified with official docs and existing codebase
- GitLab/Bitbucket: MEDIUM - Reviewed docs but not tested
- Deduplication: MEDIUM - Based on industry best practices, not official docs

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - GitHub webhook API is stable)

---

*Phase: 08-webhook-provider-architecture*
*Research completed: 2026-01-22*
