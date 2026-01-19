# Phase 3: Worker Configuration - Context

**Gathered:** 2026-01-19
**Status:** Ready for planning

## Phase Boundary

Workers receive their complete configuration at invocation time from the platform, including clanker metadata, credential variable names, and S3 URLs for large instruction files. Workers do NOT call the platform API. The architecture is hybrid: small config passed in payload, large files fetched from S3 (AWS workers) or mounted as volumes (Docker).

## Implementation Decisions

### Payload structure
- Type-specific payloads: LambdaPayload, EcsPayload, DockerPayload as separate TypeScript interfaces
- Each worker type gets its own payload schema tailored to its invocation model
- Claude's discretion: exact fields and payload shape

### Worker type distinction
- **ECS**: Task definition is the clanker config (predetermined when clanker created), runtime vars passed in payload
- **Lambda**: Function itself is the config, runtime vars passed in payload
- **Docker**: Full config passed in payload, secrets referenced from environment variables at `docker run` time

### Credential retrieval by worker type
- **AWS-based workers (Lambda/ECS)**: Retrieve credentials from SSM Parameter Store or Secrets Manager at runtime using platform AWS credentials
- **Docker worker**: Credentials passed via `-e` flags at `docker run` time from host environment

### Credential validation
- Worker validates required credentials against clanker config (config lists which creds are required)
- If required credential is missing: log warning and continue (not fail-fast)
- Claude's discretion: SSM URL pattern, fetch implementation details

### Config file / instruction handling
- **AWS workers**: Fetch LARGER INSTRUCTION FILES (agents.md, claude.md, etc.) from S3 using platform credentials
- **Docker workers**: Instruction files mounted as data volumes
- Dedicated ConfigLoader class with methods like `fetchInstructionFile()`, `parseConfig()`
- If S3 fetch succeeds but file content is malformed: log warning and continue
- Claude's discretion: fetch timing (init vs lazy), retry strategy

### Error handling
- S3 fetch failures: Claude's discretion on retry strategy
- Configuration errors reported via BOTH callback endpoint with error details AND non-zero exit code
- Detailed error messages (what went wrong, which field, which S3 URL, etc.)
- Claude's discretion: exact error format, retry/backoff implementation

### Claude's Discretion
- Exact fields in each payload type (LambdaPayload, EcsPayload, DockerPayload)
- S3 URL format and expiration for instruction files
- Fetch timing (init vs lazy loading) for instruction files
- Retry strategy for S3 fetch failures (backoff pattern, max attempts)
- Exact error message format and categorization
- ConfigLoader implementation details

## Specific Ideas

- Platform AWS credentials are used for SSM/S3 access by AWS workers (not tenant-specific role assumption)
- Credential variable names are mapped from clanker config to environment
- Docker workers rely on host environment at `docker run -e GITHUB_API_KEY=$GITHUB_API_KEY` style

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 03-worker-configuration*
*Context gathered: 2026-01-19*
