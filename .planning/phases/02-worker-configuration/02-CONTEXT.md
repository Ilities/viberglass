# Phase 2: Worker Configuration - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Workers receive their complete configuration at invocation time from the platform. The platform invokes workers (Docker run, Lambda, etc) passing the clanker configuration, executor specification, and tenant identifier. Workers use this to initialize with the correct executor type, coding agent, and credentials. This phase establishes the config payload structure and how workers consume it.

## Implementation Decisions

### Clanker config schema

**Core structure:**
- `executor` — Executor type selector ('lambda' | 'docker' | 'ecs') with type-specific fields
- `agentId` — Reference to the coding agent to use
- `context` — Structured object for context files (CLAUDE.md, agents.md, etc)

**Context object format:**
- Structured (not just file paths) — groups related context data
- Can contain file references or embedded content

### Config payload structure

**Format:** JSON string passed as argument/env var

**Structure — grouped by domain:**
```json
{
  "clanker": { ... },
  "executor": { "type": "docker|lambda|ecs", ... },
  "agent": { "id": "agent-id" },
  "tenantId": "tenant-identifier"
}
```

### Credential handling

Worker receives `tenantId` in config payload and uses `CredentialProviderFactory` to fetch credentials. This connects with Phase 1's credential system — worker doesn't receive credential values directly, just the tenant identifier.

### Worker invocation pattern

**Worker has no API.** Platform invokes worker directly:
- Docker: `docker run ... --config <json-string>`
- Lambda: Payload contains config JSON
- ECS: Task definition with config as env var or passed in entrypoint args

Worker reads config once at startup, initializes executor and agent, then begins work.

### Claude's Discretion

- Exact env var names for config payload
- Type-specific fields for each executor type
- Context object internal structure
- Config validation rules and error handling

## Specific Ideas

- "Worker doesn't have an API" — workers are dumb consumers of whatever config they're given
- Platform is responsible for invoking workers with correct configuration

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 02-worker-configuration*
*Context gathered: 2026-01-19*
