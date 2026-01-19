# Phase 3: Worker Configuration - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Workers receive their complete configuration at invocation time from the platform, including clanker configuration, executor specification, credential variable names, and tenant identifier. The platform passes config to workers; workers consume it. Actual worker execution (Lambda/ECS/Docker invocation) is Phase 4.

## Implementation Decisions

### Configuration payload shape
- **Structure:** Structured/nested — config.clanker.*, config.executor.*, config.tenant
- **Naming:** camelCase (clankerConfig, executorType, tenantId)
- **Nested objects:** Inline objects — clanker definition embedded directly in payload
- **Schema:** No formal schema — loose agreement between platform and worker
- **Executor specification:** Simple string/ID in payload
- **Extensibility:** Extensible/additional — workers ignore unknown fields

### Credential delivery method
- **Delivery mechanism:** Environment-bound — credentials pre-injected as environment variables
- **Variable discovery:** Platform passes variable names at invocation time
- **Representation:** Rich objects — array with metadata
  ```typescript
  credentials: [{ name: 'GITHUB_TOKEN', type: 'token' }, ...]
  ```
- Worker reads listed variables from its environment

### Claude's Discretion
- Exact structure of rich credential objects (what metadata fields beyond name/type)
- Nesting depth and organization of configuration sections
- How clanker configuration is structured within config.clanker
- Tenant identifier placement and format

## Specific Ideas

- Names passed at invocation time, worker reads from environment
- Inline objects for nested structures (no reference resolution)

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 03-worker-configuration*
*Context gathered: 2026-01-19*
