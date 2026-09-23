## Integrations, project settings, runs, schedules, admin pages (subagent, 2026-09-23)

F15 (beta: webhook overrides ticketing / Shortcut can't be active): NOT reproducible on current main; fixed in 83ba6e1. Root cause: Viberglass-native is stored as ticketSystem="custom", which is the same string as the Custom Webhook system id. That shared value still exists (PG3).

| # | Sev | Finding |
|---|---|---|
| PG1 | S1 | Archive project → 404: no `POST /api/projects/:id/archive` route (DAO and migration 063 exist). The error shows at the top of the page, off-screen. |
| PG2 | S1 | The delete dialog's affected-records summary calls `/deletion-summary` → 404, and the error is swallowed. Only says "tickets, runs, and configuration". No archive option offered. |
| PG3 | S2 | `ticketSystem="custom"` means both Viberglass-native and Custom Webhook. CreateTicketPage still sends it. F15-class bugs can return. |
| PG4 | S1 | A platform bug (`GIT_CONFIG_COUNT … allowUnsafeConfigEnvCount`) is shown as "could not access the configured repository, check URL/credentials", with Fix setup. |
| PG5 | S1 | An agent blocked by `external_directory` auto-reject is shown as "RESEARCH.md was not generated", with Fix setup. |
| PG6 | S2 | Runs list: no failure reason, no "started by", repository truncated from the left. |
| PG7 | S2 | The run Task panel shows a stale ticket title. The raw XML prompt is the headline content. |
| PG8 | S2 | Clicking "Configure" auto-creates an integration marked "Connected". A fake token is accepted without a test. |
| PG9 | S1 | No UI to delete an integration (`deleteIntegration()` has no callers). It stays in every project's "Available to link". |
| PG10 | S1 | Slack = manifest + `.env` + backend restart. Not linkable to a project. Copy says "Viberator"/"clanker". |
| PG11 | S2 | Project↔source routing is set in two unrelated places (project Link vs endpoint "Link to project", default "Global (all projects)"). |
| PG12 | S2 | Custom outbound destinations default to Global: every project's job events go to one URL, with no warning. |
| PG13 | S2 | Webhook URLs are shown as localhost with no public-URL hint. Slack uses a separate "Backend host" field. |
| PG14 | S2 | Project settings has no members, owner, reviewers or notifications. No role check: any member can edit prompts or delete the project. |
| PG15 | S2 | Settings jargon (`{{ clanker }}`, `viberator/{{ ticket }}`, "bug tracking"). Only one ticket source. No save confirmation. |
| PG16 | S1 | Prompt templates are raw Mustache that embeds pipeline rules (RESEARCH.md, PR_TITLE.md). Editing can break runs. No reset, versions, customised flag or preview. |
| PG17 | S2 | Global Prompt Templates is nav-hidden for members but the API isn't gated. The project tab is editable by all. |
| PG18 | S2 | API Tokens are personal but sit under "Platform". No scope, project limit or expiry (the backend supports expiresAt). |
| PG19 | S1 | Schedules: no owner, output destination, failure alerts, next run or history page (`created_by`/`next_run_at` exist in the DB). |
| PG20 | S2 | A template is required first. It asks for a runner and raw secrets. 6-part cron with seconds, no validation or human echo. |
| PG21 | S2 | Deleting a template silently cascades to its schedules and history. |
| PG22 | S3 | The Custom Webhook page is a developer contract with no plain-language outcome. Shortcut copy says "Viberator ticket". |

Leftover test data (UI can't delete): Shortcut integration ed2bac52-ad8c-4273-989a-08322bb137d3 (fake token), Custom Webhook integration a371bb68-82ad-4d9b-b767-7287c23ef1a1.
