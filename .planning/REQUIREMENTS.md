# Requirements: Viberator

**Defined:** 2026-01-19
**Core Value:** Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Worker Execution

- [x] **EXEC-01**: Platform invokes Lambda worker asynchronously via AWS SDK
- [x] **EXEC-02**: Platform starts ECS task worker via RunTask API
- [x] **EXEC-03**: Platform starts local Docker worker via docker run
- [x] **EXEC-04**: Platform handles worker execution failures with retry logic

### Result Callback

- [x] **CB-01**: Worker POSTs execution result to platform API endpoint on completion
- [x] **CB-02**: Platform updates job status in database (queued, running, completed, failed)
- [x] **CB-03**: Result payload includes commit SHA, PR URL, error message, logs
- [x] **CB-04**: Frontend polls and displays current job status to user

### Webhook Triggers

- [x] **WEB-01**: Platform receives and validates GitHub webhook events
- [x] **WEB-02**: Webhook payload creates ticket (if project configured for auto-fix)
- [x] **WEB-03**: Ticket creation triggers worker execution
- [x] **WEB-04**: Webhook signature verification prevents unauthorized requests

### Worker Configuration

- [x] **WRK-01**: Worker fetches SCM credentials from configured CredentialProvider using tenantId
- [x] **WRK-02**: Worker gets clanker configuration from invocation payload
- [x] **WRK-03**: Worker injects environment variables from clanker config into agent execution
- [x] **WRK-04**: Worker retrieves instruction files (agents.md) from clanker config
- [x] **WRK-05**: Worker authenticates git operations using SCM provider URLs

### Clanker Status Display

- [x] **STAT-01**: Platform displays clanker static status (resource exists, connected, ready)
- [x] **STAT-02**: Worker POSTs heartbeat to platform API during task execution
- [x] **STAT-03**: Worker POSTs progress updates to platform API
- [x] **STAT-04**: Platform stores and displays runtime status history
- [x] **STAT-05**: Frontend shows real-time status updates for active clankers

### Local Development

- [x] **DEV-01**: Docker compose configuration starts all services locally
- [x] **DEV-02**: Local workers execute jobs directly (no queue required)
- [x] **DEV-03**: Development documentation explains local setup

### Production Deployment

- [ ] **DEP-01**: Pulumi stack provisions complete AWS infrastructure
- [ ] **DEP-02**: Deployment process documented for all components
- [ ] **DEP-03**: Environment-specific configuration (dev, staging, prod)
- [ ] **DEP-04**: CI/CD pipeline builds and deploys container images
- [ ] **DEP-05**: Secret management uses provider pattern supporting multiple backends

### Multi-Tenant Security

- [x] **SEC-01**: CredentialProvider interface defines cloud-agnostic credential storage
- [x] **SEC-02**: Workers isolate operations by tenantId
- [x] **SEC-03**: API validates tenant access to resources
- [x] **SEC-04**: No credentials in environment variables or code

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **STAT-06**: Real-time status via WebSocket/SSE instead of polling
- **EXEC-05**: SQS queue for high-volume scenarios
- **DEP-06**: Blue-green deployment strategy for zero-downtime updates
- **WEB-05**: Support for GitLab and Bitbucket webhooks
- **DEP-07**: Azure Key Vault credential provider implementation
- **DEP-08**: GCP Secret Manager credential provider implementation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Job queue (Bull/Redis) | Direct API calls simpler for this milestone |
| User authentication | Open API for this milestone, defer to v2 |
| Real-time WebSocket | API polling sufficient for v1, defer real-time |
| Custom agent implementations | Existing factory agents sufficient |
| Advanced clanker types | Focus on Docker/ECS, defer Lambda specifics |

**Note:** Multi-cloud credential providers are supported via the provider interface pattern. Azure and GCP providers will be implemented in v2, but the architecture ensures no AWS lock-in.

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### Phase Mapping

| Phase | Requirements |
|-------|--------------|
| 1 - Multi-Tenant Security Foundation | SEC-01, SEC-02, SEC-03, SEC-04 |
| 2 - Result Callback | CB-01, CB-02, CB-03 |
| 3 - Worker Configuration | WRK-01, WRK-02, WRK-03, WRK-04, WRK-05 |
| 4 - Worker Execution | EXEC-01, EXEC-02, EXEC-03, EXEC-04 |
| 5 - Job Status Polling | CB-04 |
| 6 - Clanker Static Status | STAT-01 |
| 7 - Clanker Runtime Status | STAT-02, STAT-03, STAT-04, STAT-05 |
| 8 - Webhook Triggers | WEB-01, WEB-02, WEB-03, WEB-04 |
| 9 - Local Development | DEV-01, DEV-02, DEV-03 |
| 10 - AWS Infrastructure | DEP-01 |
| 11 - Deployment Process | DEP-02, DEP-03, DEP-04 |
| 12 - Secret Management | DEP-05 |

### Requirement Tracking

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXEC-01 | Phase 4 | Complete |
| EXEC-02 | Phase 4 | Complete |
| EXEC-03 | Phase 4 | Complete |
| EXEC-04 | Phase 4 | Complete |
| CB-01 | Phase 2 | Complete |
| CB-02 | Phase 2 | Complete |
| CB-03 | Phase 2 | Complete |
| CB-04 | Phase 5 | Complete |
| WEB-01 | Phase 8 | Complete |
| WEB-02 | Phase 8 | Complete |
| WEB-03 | Phase 8 | Complete |
| WEB-04 | Phase 8 | Complete |
| WRK-01 | Phase 3 | Complete |
| WRK-02 | Phase 3 | Complete |
| WRK-03 | Phase 3 | Complete |
| WRK-04 | Phase 3 | Complete |
| WRK-05 | Phase 3 | Complete |
| STAT-01 | Phase 6 | Complete |
| STAT-02 | Phase 7 | Complete |
| STAT-03 | Phase 7 | Complete |
| STAT-04 | Phase 7 | Complete |
| STAT-05 | Phase 7 | Complete |
| DEV-01 | Phase 9 | Complete |
| DEV-02 | Phase 9 | Complete |
| DEV-03 | Phase 9 | Complete |
| DEP-01 | Phase 10 | Pending |
| DEP-02 | Phase 11 | Pending |
| DEP-03 | Phase 11 | Pending |
| DEP-04 | Phase 11 | Pending |
| DEP-05 | Phase 12 | Pending |
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-01-19*
*Last updated: 2026-01-19 after roadmap revision (cloud-agnostic provider pattern)*
