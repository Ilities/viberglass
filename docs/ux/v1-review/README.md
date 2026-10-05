# Viberglass 1.0 UX review

Reviewed 2026-10-03 at commit `ea71ba13994a6edb754e5fd61f0ee4f3adefebb0`. This is a fresh review of the current application, not a re-publication of the September audit. Application source was not changed.

The information architecture is substantially clearer now. The remaining release risks concern trust in task state, artifact versions, runner readiness, and recovery. Visual work should simplify the task screen and setup forms without adding another workflow or approval layer.

## Status: closed (2026-10-04)

All 26 backlog items are implemented (see the resolution line on each in [BACKLOG.md](BACKLOG.md)), including UX-05 on top of the workspace model-endpoint work. "After" captures of the same five pages for every persona are in [after/](after/); the original captures in [images/](images/) stay as the evidence the review was based on. Accessibility was re-checked with axe in light and dark: no violations on the five reviewed routes ([light](accessibility-results.json), [dark](accessibility-results-dark.json)). What remains open is the follow-up validation at the end of the backlog: native providers, writable remote and real merge, live Slack, cloud compute, and sessions with recruited users.

## Start here

| Artifact | Purpose |
|---|---|
| [Review and journey coverage](REPORT.md) | Findings, strengths, limitations, and screen inventory |
| [Prioritized implementation backlog](BACKLOG.md) | Reproductions, suggested changes, acceptance criteria, and code locations |
| [Interactive mockups](mockups/index.html) | Five proposed screens, persona switching, and mobile conversation/artifact views |
| [Screenshot gallery](gallery.html) | Current-app evidence, searchable by persona/page; separate from proposed UI |
| [After captures](after/) | Home, Overview, Space, Task and Notifications for each persona, after the fixes |
| [Screenshot manifest](SCREENSHOTS.md) | Capture context and publication/reuse decisions |
| [Runner matrix](RUNNERS.md) | All 13 catalog providers and eight harnesses; real execution results |
| [Validation record](VALIDATION.md) | Checks performed and boundaries of the evidence |
| [Manual testing](MANUAL-TESTING.md) | Step-by-step manual pass over the fixes, on the review and empty instances |
| [Review environment](ENVIRONMENT.md) | Local instance, fixture accounts, isolation, rerun and shutdown |
| [User documentation index](personas/README.md) | Seven individual guides plus shared terminology |

The package includes **85 current-app captures, seven mockup images, five interactive proposal screens, seven persona guides and 26 actionable todos**. The three P0 items concern empty successful output, incorrect version links and runner readiness. Handback also resumed older paused sessions unexpectedly (UX-26).

## What was exercised

Fresh admin registration; setup and demo; invited guest acceptance; admin, PM, maintainer, reviewer, watcher and viewer navigation; task creation; people assignment; mentions; watching; agent selection; real z.ai-backed research; blocking agent questions and answers; research revisions; inline feedback; planning with that feedback; a code turn reaching repository publication failure; cancellation; failure recovery screens; personal notifications and delivery to local email.

Desktop: 1440 × 1000 and 1280 × 800. Tablet: 768 × 1024. Mobile: 390 × 844. Light and application-selected dark themes. Keyboard mentions and automated axe checks on five principal pages. This is an expert walkthrough with fictional accounts, not a study with recruited users.

## Documentation status

The persona guides describe **current behavior** and are suitable as the text baseline for user-facing documentation. Known limitations are collected in the review, with guide-specific editorial notes after each guide. Mockups describe proposed behavior and must not be presented as shipped product documentation.

The screenshots are real captures. Most need recapturing after the proposed fixes. Personal notification content is the strongest reuse candidate. See [SCREENSHOTS.md](SCREENSHOTS.md); a screenshot’s presence does not imply that its screen is final.

## Practical limits

Native provider accounts, live Slack, a writable remote GitHub repository, a real pull-request merge, AWS/ECS/Lambda/Kubernetes, long-context compaction, and reminder delivery after hours were not validated. Google and Mistral runner configurations exist but require native credentials; the app does not expose a GLM endpoint path for those harnesses. PR presentation was inspected using the clearly labeled built-in demo. See the coverage tables for which outcomes were live, simulated, or blocked.

The review instance remains available at [localhost:3200](http://localhost:3200), with mail at [localhost:8125](http://localhost:8125). Fixture credentials are in the ignored `.tmp/ux-review/accounts.json`; the z.ai token is absent from all review artifacts.
