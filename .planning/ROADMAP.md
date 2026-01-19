# Roadmap: Viberator

## Overview

This is a brownfield integration project. The core components exist—CRUD operations for tickets/projects/clankers, agent factory, and worker handlers—but the integration plumbing is missing. The roadmap starts by establishing cloud-agnostic multi-tenant security foundations with a provider interface pattern, then builds the worker execution flow (callbacks, invocation, configuration), adds visibility features (status display, polling), integrates external triggers (provider-agnostic webhooks), and finally establishes development and production environments. Each phase delivers a verifiable integration milestone that unblocks subsequent work.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Multi-Tenant Security Foundation** - Cloud-agnostic credential storage interface with AWS SSM provider implementation
- [ ] **Phase 2: Result Callback** - Workers POST results to platform API
- [ ] **Phase 3: Worker Execution** - Platform invokes Lambda/ECS/Docker workers
- [ ] **Phase 4: Worker Configuration** - Workers fetch credentials and clanker configs
- [ ] **Phase 5: Job Status Polling** - Frontend displays current job status
- [ ] **Phase 6: Clanker Static Status** - Platform displays resource readiness
- [ ] **Phase 7: Clanker Runtime Status** - Workers POST heartbeat and progress updates
- [ ] **Phase 8: Webhook Provider Architecture** - Provider-agnostic webhook integration with GitHub as first implementation
- [ ] **Phase 9: Local Development** - Docker compose environment for local development
- [ ] **Phase 10: AWS Infrastructure** - Pulumi stack provisions cloud resources and AWS credential provider
- [ ] **Phase 11: Deployment Process** - CI/CD pipeline and environment-specific configs
- [ ] **Phase 12: Secret Management** - Provider-based secret management for all deployment targets

## Phase Details

### Phase 1: Multi-Tenant Security Foundation

**Goal**: All tenant credentials are securely stored and isolated by tenantId through a cloud-agnostic provider interface, enabling support for AWS, other clouds, and local deployment.

**Depends on**: Nothing (first phase)

**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04

**Success Criteria** (what must be TRUE):
1. CredentialProvider interface defines get/put/delete operations for tenant-scoped credentials
2. AwsSsmProvider implements CredentialProvider using AWS SSM Parameter Store
3. FileProvider implements CredentialProvider for local development using encrypted file storage
4. EnvironmentProvider implements CredentialProvider for environment variable fallback
5. API validates that requests only access resources belonging to the requesting tenant
6. No credential values appear in logs, error messages, or API responses

**Provider Interface Pattern**:
```typescript
interface CredentialProvider {
  get(tenantId: string, key: string): Promise<string | null>
  put(tenantId: string, key: string, value: string): Promise<void>
  delete(tenantId: string, key: string): Promise<void>
}
```

**Plans**: 5 plans in 4 waves

**Status**: ✅ Complete (2026-01-19)

Plans:
- [x] 01-01-PLAN.md — Create CredentialProvider interface, EnvironmentProvider, and log redaction utilities
- [x] 01-02-PLAN.md — Implement FileProvider with AES-256-GCM encryption
- [x] 01-03-PLAN.md — Implement AwsSsmProvider with SSM SDK v3
- [x] 01-04-PLAN.md — Create CredentialProviderFactory and tenant validation middleware
- [x] 01-05-PLAN.md — Write comprehensive tests for credential system (TDD)

---

### Phase 2: Result Callback
