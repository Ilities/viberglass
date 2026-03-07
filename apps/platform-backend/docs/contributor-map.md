# Platform Backend Contributor Map

This guide answers "where should I put this change?" for common backend contributions.

## API Routes
- Route entrypoints: `src/api/routes/*`
- Ticket route modules: `src/api/routes/tickets/*`
- Route-level middleware: `src/api/middleware/*`

When adding endpoints:
1. Add route handler logic in the closest route module.
2. Keep handlers thin; delegate business logic to a service.
3. Reuse validation helpers in `src/api/middleware/validation.ts`.

## Domain Services
- Core service layer: `src/services/*`
- Domain error contracts: `src/services/errors/*`
- Shared ticket run setup orchestrator: `src/services/ticketRunOrchestration.ts`
- Worker orchestration: `src/workers/*`
- Integration orchestration services: `src/api/services/integrations/*`

When adding business logic:
1. Keep route-specific HTTP concerns out of services.
2. Keep DB query composition in DAOs, not in route files.
3. Prefer small collaborator services over extending large monolith classes.
4. For routeable domain failures, throw typed service errors instead of relying on message text parsing in routes.

## Persistence (DAOs + DB Types)
- DAOs by domain: `src/persistence/**`
- Database type map: `src/persistence/types/database.ts`
- DB config: `src/persistence/config/database.ts`
- Migrations: `src/migrations/*`

When adding persistence:
1. Add/modify migration first.
2. Update DB typing in `database.ts`.
3. Add/update DAO methods in the corresponding domain folder.

## Integrations and Webhooks
- Provider-agnostic webhook orchestration: `src/webhooks/*`
- Provider implementations: `src/webhooks/providers/*`
- Inbound processors: `src/webhooks/inbound-processors/*`
- Integration API services: `src/api/services/integrations/*`
- Transitional plugin layer: `src/integration-plugins/*`

When adding a provider:
1. Add provider class + inbound processor.
2. Register provider/policy/resolver wiring.
3. Add route-level and service-level tests for provider behavior.

## Provisioning and Clankers
- Provisioning orchestrator/handlers: `src/provisioning/*`
- Worker invokers/factory: `src/workers/*`
- Clanker persistence: `src/persistence/clanker/*`

When adding a deployment strategy:
1. Implement provisioning handler.
2. Extend strategy resolver.
3. Add invoker support if execution path differs.
4. Add unit tests for handler + resolver + invoker behavior.

## Credentials and Secrets
- Secret abstraction: `src/services/SecretService.ts`
- Credential providers: `src/credentials/*`
- Secret routes: `src/api/routes/secrets.ts`

When adding a credential backend:
1. Implement provider in `src/credentials`.
2. Register in provider factory.
3. Add provider + factory tests.

## Tests
- Unit tests: `src/__tests__/unit/**`
- Integration tests: `src/__tests__/integration/**`
- Shared test helpers: `src/__tests__/helpers/**`

Test placement rules:
1. Route behavior changes: add/update route tests in `unit/api/routes/*`.
2. Business logic changes: add/update service tests in `unit/services/*`.
3. DB + cross-module behavior: integration tests.

## Open-Source Hygiene
- Architecture docs: `docs/architecture.md`
- Refactor backlog: `docs/refactor-backlog.md`
- This contributor map: `docs/contributor-map.md`

For non-trivial PRs, update docs in `docs/` when behavior or structure changes.
