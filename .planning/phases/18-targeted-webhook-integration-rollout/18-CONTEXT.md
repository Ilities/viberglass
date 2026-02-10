# Phase 18: Targeted Webhook Integration Rollout - Context

**Created:** 2026-02-09  
**Owner:** Codex + Jussi  
**Status:** Planned

## Goal

Deliver a production-ready webhook architecture where each integration has targeted inbound/outbound configuration and behavior, instead of a generic shared form and generic endpoint behavior.

Integrations in scope:
- Jira (inbound and outbound)
- Shortcut (inbound and outbound)
- GitHub (inbound and outbound)
- Custom webhooks (multiple inbound and multiple outbound)

## Current State Summary

Backend and frontend currently expose webhook configuration under integration detail pages, but behavior still contains generic assumptions and incorrect routing in critical paths.

Key observed gaps:
1. Webhook service config resolution is biased to GitHub metadata and does not robustly resolve Jira/Shortcut/custom inbound configs.
2. Provider signature handling is split between route middleware and service, with inconsistent header naming and weak provider-specific guarantees.
3. Frontend API resolves by `TicketSystem` and often uses first matching integration instance instead of explicit integration entity IDs.
4. Outbound config currently behaves like a single generic object, not provider-targeted behavior with provider-specific fields.
5. Custom webhooks support multiple inbound configs in parts of the stack, but UX and endpoint contracts are not fully built for multi-inbound and multi-outbound.
6. Delivery history and retry paths are constrained by provider-level/failure-only queries and are not reliably config-scoped.
7. Legacy webhook APIs and deprecated project-scoped routes still coexist and can cause drift.

## Architectural Intent

Phase 18 moves webhook behavior to an integration-targeted model:
1. Instance-scoped configuration everywhere (`integration.id` based).
2. Provider-specific inbound parsing + signature + event mapping.
3. Provider-specific outbound publishing and payload shaping.
4. Config-scoped delivery observability.
5. Custom provider supports many inbound configs and many outbound destinations.

## Execution Strategy

This phase is intentionally sequential and integration-by-integration:
1. Foundation and contracts first.
2. GitHub end-to-end.
3. Jira end-to-end.
4. Shortcut end-to-end.
5. Custom multi/multi end-to-end.
6. Delivery observability and cleanup.

## Planned Documents

This phase contains one plan document per PR-sized unit:
- `18-01-PLAN.md` through `18-17-PLAN.md`

The documents include:
- scope and objective
- dependencies
- implementation tasks
- expected files/endpoints
- test plan
- acceptance criteria
- risks and mitigation

## Non-Goals

- Introducing new external integration providers beyond Jira/Shortcut/GitHub/Custom.
- Reworking unrelated project/integration management UX outside webhook-related paths.
- Replacing existing job orchestration semantics.
- No need to keep compatibility with old implementation. Everything is unused

