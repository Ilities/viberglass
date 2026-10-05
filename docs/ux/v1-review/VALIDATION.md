# Review validation record

This review changes documentation, screenshots, mockups and review helpers. Application source is unchanged. Checks below validate the package and support the findings; they are not an application release certification.

| Check | Result | Evidence / limitation |
|---|---|---|
| Fresh instance and separate database | Passed | Review ports/resources and fixture access in ENVIRONMENT.md |
| Worker compilation | Passed | `npm run build:worker`; private `.tmp/ux-review/worker-build.log` |
| Current worker overlay | Built | Missing Antigravity package corrected; Pi separately upgraded and retried |
| Catalog configuration coverage | 14 runners | 13 non-test catalog providers plus Pi; eight harnesses; RUNNERS.md distinguishes configured from executed |
| GLM direct request | HTTP 200 | Requested Flash returned OK, ten total tokens; no invented monetary total |
| Real task collaboration | Exercised | Task creation, invite acceptance, mention, blocking answers, research revisions, inline feedback and plan |
| Code publication | Environment boundary | Read-only fixture push failed; demo PR presentation inspected; no live PR/merge claimed |
| Cancellation | Exercised | OpenCode containers stopped and history retained; partial document existed |
| Handoff | Defect reproduced | One Hand back resumed three older paused sessions; steering-results.json and UX-26 |
| Manual lifecycle | Exercised | Disposable task marked done, reopened and archived through UI |
| Watching | Exercised | Sam stopped watching and watched again; Quinn also added watching |
| Permissions | Verified sample | Private visibility and refused writes/secret access; permission-results.json |
| Email | Local delivery | Invites/test email reached Mailpit; no remote delivery claim |
| Accessibility | One confirmed violation | Artifact subtab tablist children; keyboard mention defect; contrast checks incomplete |
| Current app viewports/themes | Captured | 1440/1280 desktop, 768 tablet, 390 mobile; application-selected dark states |
| Gallery | Passed | 85 cards, search and persona filtering; no horizontal overflow at 390 px |
| Interactive mockups | Passed | Five screens, answer changes situation, simulated connection enables continuation, admin-only setup, viewer composer hidden, version preview and mobile view switching |
| Mockup browser errors | None observed | Chromium checks of the listed interactions |
| Recapture helper | Passed | Viewer captures all five read-only routes into ignored private directory |
| Instance helper | Status verified | All three recorded process identities/listeners verified; stop/restart code inspected but not executed during finalization |
| Package references | Passed | Relative Markdown links and HTML href/src destinations exist; JSON parses |
| File size rules | Passed | All new text files ≤350 lines; Markdown >100 lines has contents list |
| Credential check | Passed | Exact z.ai/session token scan found no matches; secret pages visually show metadata, not values |

No application unit/integration suite was run for this documentation-only change. Live-stream pause/interrupt, native credentials, writable remote merge, live Slack, reminders, long-context compaction and cloud compute remain follow-up verification. The persona guides mark source-inspected behaviors separately from executed ones where relevant.

Current captures are a sequence: tasks evolved and some named screens were recaptured after later interactions. Proposed screenshots contain simulated data and are explicitly labeled. See SCREENSHOTS.md before choosing images for public documentation.

## Closing validation (2026-10-04)

After the backlog was implemented, on the merged build (UX changes plus workspace model endpoints) against the same review instance:

| Check | Result | Evidence / limitation |
|---|---|---|
| Unit suites | Passed | Platform backend 173 suites / 1,206 tests; frontend 64 / 296; worker core 37 tests. Each suite run on its own with capped workers |
| Type checks and lint | Passed | Backend and frontend `tsc`; eslint reports no errors (two older warnings remain) |
| Accessibility, light | No violations | axe on Home, Overview, Space, Task, Notifications ([accessibility-results.json](accessibility-results.json)); contrast is now measurable on the neutral surfaces; incomplete checks are one prohibited-attribute node per page and one or two contrast nodes |
| Accessibility, dark | No violations | Same routes with the dark theme ([accessibility-results-dark.json](accessibility-results-dark.json)) |
| Persona captures | Recaptured | `harness/capture.cjs` for all six personas into [after/](after/) |
| Browser checks | Exercised | Version link opens v1 with comparison; readiness labels on the runner list; failure card on a Codex failure; next-agent line (including for a guest); Overview totals; task at 390 px with no horizontal overflow; runner form; space settings; dark theme |
| Timestamp handling | Verified | With the process in CEST, the database's `now()` and the app's time agree, and a timestamp round-trips exactly |
| Migration | Applied | `100_model_endpoints` on the review database before the restart |

Not re-run: live provider turns (the fixes to empty-document detection, failure classification and hand back are covered by unit tests and need a rebuilt worker image to exercise end to end), real PR merge, Slack, and the custom-endpoint setup flow against a live endpoint (covered by component and service tests).

