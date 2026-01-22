# Phase 8: Webhook Provider Architecture - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Provider-agnostic webhook integration with GitHub as the first implementation. Incoming webhooks from external platforms trigger ticket creation and optionally clanker execution. Providers handle both inbound (receiving webhooks) and outbound (posting results back to the platform).

</domain>

<decisions>
## Implementation Decisions

### Provider Interface Design
- Plugin system for providers — dynamically loadable at runtime from config/files
- Generic signature validator with configurable algorithm + secret location (not per-provider custom validation)
- Maximal interface: validate + parseEvent + respond + outbound calls (posting comments, status updates)
- Secret storage is user-configurable in UI: database for local runs, SSM for cloud deployments

### GitHub Webhook Scope
- Events that create tickets: Issues + PR comments (mentioning @bot)
- Project/clanker selection: Repository mapping for project (configured in UI), labels can override clanker selection
- Auto-execution: Configurable per project — settings control whether to auto-run clanker or just create ticket
- Result feedback: Both comment on issue/PR with details + label updates (e.g., 'fix-submitted', 'failed')

### Webhook Delivery Handling
- Deduplication: Content-based (hash payload, skip if same hash seen recently)
- Processing: Synchronous — process immediately in request handler
- Logging: Basic application logs for debugging (no database event history)
- Error handling: Manual retry mechanism — store failed events for inspection and manual retry

### Webhook Configuration UX
- Configuration location: Global tenant-wide default provider, projects can override
- Setup guidance: Copy-paste config — show exact settings to paste into GitHub webhook config
- Testing: Test endpoint button that sends synthetic test event to verify configuration
- Secret generation: Either option — UI supports auto-generate or paste existing secret

### Claude's Discretion
- Exact plugin loading mechanism
- Signature validation library choice
- Hash algorithm for deduplication
- Failed event storage schema

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-webhook-provider-architecture*
*Context gathered: 2026-01-22*
