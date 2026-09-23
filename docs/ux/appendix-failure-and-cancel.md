## Failure & cancel path findings (subagent, 2026-09-23)

Beta claim "cancelling a research session leaves no record": FALSE. Cancel keeps records, but it doesn't stop work, and a cancelled session can come back as completed. Only project delete destroys records: sessions/events cascade, and jobs are orphaned with ticket_id NULL.

| # | Sev | Finding |
|---|---|---|
| FL1 | S1 | "Cancel run" → 404. The frontend calls `/api/jobs/:id/cancel` (`job-api.ts:193`), but no route exists in `routes/jobs.ts`. `JobCancellationService` has no callers. The run continues. |
| FL2 | S1 | Live-session Cancel doesn't stop the agent. `AgentSessionInteractionService.cancelExclusive` only updates session/turn/event rows. The job stayed active for ~3 min, with 1,385 events after the cancel. |
| FL3 | S1 | The cancelled session flipped to `completed` and wrote a 7,928-char research doc. The user's cancel is silently overturned. |
| FL4 | S2 | No confirmation on either Cancel. |
| FL5 | S2 | `cancelledBy` is stored but never shown. |
| FL6 | S2 | An automatic run can't be stopped from the ticket, the ⋯ menu or the Runs list. "Run Research" stays enabled during a run. |
| FL7 | S2 | Contradictory status after cancel: phase "In Progress", runs "in progress", history "cancelled", Pulse "In Progress". |
| FL8 | S2 | No Resume/Restart on a cancelled session. The composer disappears. |
| FL9 | S2 | The live-session job has `agent_session_id=NULL` and no `ticket_phase_runs` row. |
| FL10 | S1 | The ticket shows "Research failed" with no reason while the phase says "In Progress". No notification. |
| FL11 | S1 | Failures are absent from Pulse and the project dashboard. LVP shows "Calm Orbit, 0 failed" (recency window). |
| FL12 | S1 | Regex failure classifier (`classifyJobFailure.ts`) mislabels the GIT_CONFIG_COUNT platform bug as "could not access the configured repository", with Fix setup. |
| FL13 | S1 | The agent read `/app` (worker source) instead of the cloned repo and wrote `/app/RESEARCH.md`. Failed with "RESEARCH.md was not generated". Work lost, worker internals exposed. |
| FL14 | S2 | "Fix setup" on every failure incl. agent failures. No Retry, "Retry with instructions" or "Take over". |
| FL15 | S2 | Agent failures show raw OpenCode JSON and no owner. |
| FL16 | S2 | No repo/credential validation at project creation. The resulting repo-access failure message is good. |
| FL17 | S3 | Runs list has no reason column. The run task shows a stale ticket title. A UI-created ticket is tagged "Custom Webhook" on its card. |
| FL18 | S3 | Runner-unavailable not observed. Unstarted runners are hidden from the picker. The `AGENT_RUNNER_UNAVAILABLE` regex is loose. |
