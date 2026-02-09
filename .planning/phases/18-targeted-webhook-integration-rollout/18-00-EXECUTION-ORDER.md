# Phase 18: Execution Order

**Status:** Planned

## Ordered Plan Sequence

1. `18-01-PLAN.md` - Webhook Core Stabilization
2. `18-02-PLAN.md` - DB and DAO Corrections for Multi-Config and Provider Coverage
3. `18-03-PLAN.md` - Integration Webhook API v2 (Instance-Scoped)
4. `18-04-PLAN.md` - Frontend Routing and API Client Refactor (Instance-Scoped)
5. `18-05-PLAN.md` - GitHub Inbound
6. `18-06-PLAN.md` - GitHub Outbound
7. `18-07-PLAN.md` - GitHub Targeted Configuration UI
8. `18-08-PLAN.md` - Jira Inbound
9. `18-09-PLAN.md` - Jira Outbound
10. `18-10-PLAN.md` - Jira Targeted Configuration UI
11. `18-11-PLAN.md` - Shortcut Inbound and Outbound Core
12. `18-12-PLAN.md` - Shortcut Targeted Configuration UI
13. `18-13-PLAN.md` - Custom Inbound Multi-Webhook
14. `18-14-PLAN.md` - Custom Outbound Multi-Destination
15. `18-15-PLAN.md` - Custom Outbound Targeted UI
16. `18-16-PLAN.md` - Delivery/Retry UX and Observability
17. `18-17-PLAN.md` - Cleanup, Deprecation Removal, and Documentation

## Dependency Notes

- Plans 1-4 are foundational and unblock provider-specific rollout.
- Plans 5-7, 8-10, 11-12, and 13-15 are integration-specific implementation slices.
- Plan 16 standardizes delivery visibility/retry across all integrations.
- Plan 17 removes deprecated paths after all integration paths are confirmed.

## Completion Definition for the Phase

Phase 18 is complete when:
1. Each integration has targeted inbound and outbound configuration UX and backend behavior.
2. Custom webhooks support multiple inbound and multiple outbound configurations.
3. Delivery history and retry are config-scoped and operational.
4. Deprecated generic webhook paths are removed or hard-deprecated with no active callers.
5. Updated tests and docs reflect the new integration-specific operating model.

