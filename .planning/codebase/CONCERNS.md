# Codebase Concerns

**Analysis Date:** 2026-01-19

## Tech Debt

**Deployment Logic Not Implemented:**
- Issue: Clanker start/stop endpoints return success but don't actually deploy or stop anything
- Files: `platform/backend/src/api/routes/clankers.ts:129-142`, `platform/backend/src/api/routes/clankers.ts:163-168`
- Impact: Clankers show as "active" in the UI but are never deployed. Users cannot actually deploy or manage clankers.
- Fix approach: Implement deployment logic based on `deploymentStrategy` field - integrate with Docker, ECS, Kubernetes, or Lambda depending on strategy

**Unused DEBUG_LOG Prefixes:**
- Issue: Extensive debug logging with `[DEBUG_LOG]` prefix throughout codebase that serves no structured purpose
- Files: `platform/backend/src/services/MessageQueueService.ts:86-202`, `platform/backend/src/api/server.ts:57-70`, `platform/backend/src/test/api.test.ts:127-133`
- Impact: Clutters logs, makes debugging harder, no structured way to filter these logs
- Fix approach: Replace with proper logging framework (winston/pino) and log levels

**Environment Variable Overload:**
- Issue: Direct `process.env` access scattered throughout codebase without centralized environment management
- Files: `viberator/app/src/config/ConfigManager.ts:213-241`, `viberator/app/src/workers/lambda-handler.ts:39-40`
- Impact: Difficult to test, no validation, type safety issues with `as any` casts
- Fix approach: Centralize all env access through ConfigManager with validation and types

**Deprecated String.substr() Usage:**
- Issue: Using deprecated `substr()` method instead of `substring()` or `slice()`
- Files: `viberator/app/src/workers/lambda-handler.ts:45`, `viberator/app/src/orchestrator/AgentOrchestrator.ts:160`, `platform/backend/src/api/routes/jobs.ts:26`
- Impact: Will break in future JavaScript versions, deprecated since ES5
- Fix approach: Replace all `substr()` calls with `substring()` or `slice()`

**Type Safety Issues with `any` Types:**
- Issue: Extensive use of `any` type throughout codebase, bypassing TypeScript's type checking
- Files: `viberator/app/src/index.ts:10`, `viberator/app/src/index.ts:329`, `platform/backend/src/integrations/GitHubIntegration.ts:27`, `platform/backend/src/models/PMIntegration.ts:12`
- Impact: Loss of type safety, runtime errors, difficult refactoring
- Fix approach: Define proper types for all `any` usages, especially for logger, error handling, and API client types

## Known Bugs

**N+1 Query Pattern in Clanker Listing:**
- Symptoms: `listClankers()` fetches config files individually for each clanker in a loop
- Files: `platform/backend/src/persistence/clanker/ClankerDAO.ts:190-196`
- Trigger: Calling GET `/api/clankers` with multiple results
- Workaround: Use small limit/offset values
- Fix approach: Use a single JOIN query or batch fetch config files

**Empty Error Handling in Data Layer:**
- Symptoms: Functions return `null` silently when data not found, no way to distinguish "not found" from "error"
- Files: `platform/backend/src/persistence/clanker/ClankerDAO.ts:83,118,245`, `platform/frontend/src/data.ts:25,34,65`
- Trigger: Database errors, missing records
- Workaround: None - errors are swallowed
- Fix approach: Return Result type or throw specific errors for not-found vs error cases

**Mock Data Fallback in Frontend:**
- Symptoms: `data.ts` returns mock data when API calls fail, silently masking errors
- Files: `platform/frontend/src/data.ts:54-56`, `platform/frontend/src/data.ts:145-178`
- Trigger: API errors, network failures
- Workaround: Check browser console for warnings
- Fix approach: Remove mock fallbacks, properly surface errors to users

## Security Considerations

**Database SSL Misconfiguration:**
- Risk: `rejectUnauthorized: false` disables certificate validation, vulnerable to MITM attacks
- Files: `platform/backend/src/persistence/config/database.ts:14`, `platform/backend/migrations/migrator.ts:18`
- Current mitigation: None explicitly documented
- Recommendations: Remove `rejectUnauthorized: false`, use proper SSL certificates, add certificate pinning

**Committed .env File with Credentials:**
- Risk: `.env` file committed with actual database password
- Files: `platform/backend/.env:6` (contains `DB_PASSWORD=salasana`)
- Current mitigation: None - file is tracked in git
- Recommendations: Add `.env` to `.gitignore`, rotate exposed password, use git-secrets or similar to prevent future commits

**GitHub Token Stored as Process Environment:**
- Risk: Tenant credentials stored in `process.env` at runtime, potentially leaked in logs/core dumps
- Files: `viberator/app/src/workers/lambda-handler.ts:39-40,61-62`
- Current mitigation: Tokens are deleted after use
- Recommendations: Use credential manager (AWS Secrets Manager, HashiCorp Vault), never log environment variables

**Webhook Signature Verification Bypass:**
- Risk: If `GITHUB_WEBHOOK_SECRET` is not set, webhook signature verification is bypassed entirely
- Files: `platform/backend/src/api/routes/webhooks.ts:18-24`
- Current mitigation: Returns 401 if signature/secret missing, but secret may be empty string
- Recommendations: Require webhook secret in production, fail closed if not configured

**Generic Error Messages in Production:**
- Risk: Stack traces exposed in development mode, error messages may leak internal implementation
- Files: `platform/backend/src/api/app.ts:227-247`
- Current mitigation: Only show stack in development
- Recommendations: Sanitize all error messages, implement error code mapping, log detailed errors server-side only

## Performance Bottlenecks

**Inefficient Clanker Listing with N+1 Queries:**
- Problem: Each clanker triggers a separate query for config files
- Files: `platform/backend/src/persistence/clanker/ClankerDAO.ts:190-196`
- Cause: Loop-based fetching instead of batch/JOIN queries
- Improvement path: Use `json_agg()` in PostgreSQL or separate batch fetch with `WHERE clanker_id IN (...)`

**No Connection Pooling Configuration:**
- Problem: Database/Redis connection pool sizes not explicitly configured
- Files: `platform/backend/src/persistence/config/database.ts`
- Cause: Using default pg/Kysely pool settings
- Improvement path: Configure pool `min`, `max`, `idleTimeoutMillis` based on expected load

**Synchronous File Operations:**
- Problem: Some file operations may block event loop
- Files: `viberator/app/src/agents/BaseAgent.ts:234-247`
- Cause: Mix of `fs.promises` and potential sync operations
- Improvement path: Ensure all file I/O uses async promises

**No Response Caching:**
- Problem: API responses not cached, repeated queries for same data
- Files: All API routes in `platform/backend/src/api/routes/`
- Cause: No caching layer implemented
- Improvement path: Add Redis-based caching for frequently accessed data (clankers, projects, deployment strategies)

## Fragile Areas

**Agent Execution Flow:**
- Files: `viberator/app/src/orchestrator/AgentOrchestrator.ts:156-232`, `viberator/app/src/agents/BaseAgent.ts`
- Why fragile: Multi-step process (clone, execute, cleanup) with failure modes at each step, incomplete error handling
- Safe modification: Add comprehensive integration tests for each agent type, test failure scenarios
- Test coverage: Only 2 unit test files exist (`GitService.test.ts`, `AgentFactory.test.ts`), no integration tests for orchestrator

**Clanker Deployment State Management:**
- Files: `platform/backend/src/api/routes/clankers.ts:111-175`
- Why fragile: Status transitions happen via `setTimeout`, no reconciliation loop, can desync from actual deployment
- Safe modification: Implement state machine with reconciliation loop, add health checks
- Test coverage: No tests for deployment status transitions

**Git Integration:**
- Files: `viberator/app/src/services/GitService.ts:282` (empty return on error)
- Why fragile: Returns empty array on any error, no distinction between authentication/permission/other errors
- Safe modification: Add typed error classes, proper error propagation
- Test coverage: Only 1 test file with basic cases

**Webhook Processing:**
- Files: `platform/backend/src/api/routes/webhooks.ts`
- Why fragile: Direct database queries in route handlers, no transaction management, can leave partial state
- Safe modification: Move to service layer with transactions, add idempotency keys
- Test coverage: No webhook integration tests

## Scaling Limits

**Single-Process Job Execution:**
- Current capacity: Max 3 concurrent jobs (`MAX_CONCURRENT_JOBS=3`)
- Limit: Cannot scale beyond single process, no horizontal scaling support
- Scaling path: Implement distributed job queue (BullMQ, Celery) with multiple workers

**No Rate Limiting:**
- Current capacity: Unlimited API requests
- Limit: Vulnerable to abuse, can overwhelm database/external APIs
- Scaling path: Add rate limiting middleware (express-rate-limit), per-user quotas

**Ephemeral Worker Spawning:**
- Current capacity: New container per job
- Limit: Container startup overhead, maximum concurrent containers limited by host resources
- Scaling path: Implement worker pool with reusable containers, or serverless function delegation

**No Pagination on Some Endpoints:**
- Current capacity: Default limit of 50 on clankers list
- Limit: Cannot efficiently fetch large datasets, potential memory issues
- Scaling path: Add cursor-based pagination to all list endpoints

## Dependencies at Risk

**Direct Axios Usage:**
- Risk: Version compatibility issues, axios caught in supply chain attacks
- Impact: All HTTP requests in GitHubIntegration could break
- Migration plan: Wrap Axios in custom HTTP client interface, can swap to fetch or got if needed

**Kysely (Database Query Builder):**
- Risk: Breaking changes between versions, SQL generation bugs
- Impact: All database queries could fail
- Migration plan: Keep tests pinned to specific Kysely version, consider Prisma or Drizzle as alternatives

**Multiple Agent CLI Dependencies:**
- Risk: External CLI tools (claude-code, qwen-cli, etc.) may change behavior or disappear
- Impact: Agent execution fails unpredictably
- Migration plan: Version-lock all CLI tool requirements, add compatibility checks on startup

**Child Process Spawning:**
- Risk: Relies on spawn() working correctly across platforms, sensitive to PATH configuration
- Impact: All agent CLI executions fail
- Migration plan: Abstract CLI execution to allow Docker-based agent execution as fallback

## Missing Critical Features

**No Authentication/Authorization:**
- Problem: No user authentication, API keys not validated, no permission system
- Blocks: Multi-tenancy, per-user clankers, audit logging
- Impact: Anyone with network access can use all API endpoints

**No Job Retry Logic:**
- Problem: Failed jobs are marked failed but never retried
- Blocks: Reliable agent execution, handling transient failures
- Impact: Temporary network/hardware failures cause permanent job failures

**No Dead Letter Queue:**
- Problem: Permanently failed jobs have no analysis or manual intervention path
- Blocks: Production debugging, failure analysis
- Impact: Difficult to diagnose why agents fail

**No Audit Logging:**
- Problem: User actions not logged, no trail of who changed what
- Blocks: Compliance, debugging user issues
- Impact: Cannot trace how clankers/projects were modified

## Test Coverage Gaps

**Frontend Components:**
- What's not tested: All React components, forms, API integration in browser
- Files: `platform/frontend/src/app/**/*.tsx`, `platform/frontend/src/components/**/*.tsx`
- Risk: UI regressions, broken user flows
- Priority: High (user-facing code)

**API Routes:**
- What's not tested: Most API endpoints beyond basic example test
- Files: `platform/backend/src/api/routes/*.ts` (except minimal coverage in `api.test.ts`)
- Risk: API regressions, broken integrations
- Priority: High (core functionality)

**Agent Execution:**
- What's not tested: Full agent execution flow, actual CLI tool invocation, git operations
- Files: `viberator/app/src/agents/*.ts`, `viberator/app/src/orchestrator/AgentOrchestrator.ts`
- Risk: Agent failures in production, broken fix workflows
- Priority: Critical (core value proposition)

**Database Migrations:**
- What's not tested: Migration rollbacks, migration edge cases
- Files: `platform/backend/migrations/*.ts`
- Risk: Broken migrations on production
- Priority: Medium (infrastructure)

**Error Paths:**
- What's not tested: Error handling, failure modes, timeout scenarios
- Files: All services
- Risk: Unhandled errors crash processes
- Priority: High (reliability)

---

*Concerns audit: 2026-01-19*
