# Screenshot inventory and reuse decisions

All current-app images were captured against the isolated local review instance on 2026-10-03. They are evidence, not mockups or proof of a final UI. No secret values were revealed. Full-page images may be much taller than their viewport. Fixtures changed during the session; captures are a journey sequence, not simultaneous account views.

## Contents

- [Reuse rules](#reuse-rules)
- [Current application](#current-application)
- [After the fixes](#after-the-fixes)
- [Proposed UI](#proposed-ui)

## Reuse rules

- **Content reuse candidate:** sign-in form (61) and non-viewer notification content (58) were captured directly from browser elements, excluding the surrounding chrome. No specific interaction redesign is proposed for these form/content regions. Recheck copy if scoped settings labels or common styling changes; fixture identity is deliberate.
- **Evidence; recapture:** all other full screens include planned changes to navigation/chrome, status, forms, interactions or summaries. Use them for review discussion; publish replacement screenshots after the relevant backlog work is accepted.
- Use the viewer notification image only as evidence of misleading Home copy. Do not publish it as a successful viewer workflow.
- Demo research/PR images are sample data; neither demonstrates provider output or a real merge. Label them as demo if shown.
- The old-version and empty-success captures are defect evidence. Do not turn them into instructions describing intended behavior.
- For final user documentation, choose a clean scenario with a working runner, resolved decisions and no compatibility-probe failures. Replace local URLs/names only through a new capture; do not disguise evidence images.

## Current application

Viewport is 1440 × 1000 unless stated. PNG dimensions are given in screenshots.json. The gallery links to full-resolution originals; thumbnails retain aspect ratio. Dark captures are explicitly marked.

| Image | Persona | Context | Publication decision |
|---|---|---|---|
| [01-first-admin.png](images/01-first-admin.png) | admin | First administrator registration: Fresh database; light | Recapture |
| [02-registration-validation.png](images/02-registration-validation.png) | admin | Registration validation error: Rejected .test email; valid fixture address used afterward; light | Recapture |
| [03-model-setup.png](images/03-model-setup.png) | admin | Model setup: Catalog provider menu; no custom-provider path; light | Recapture |
| [04-demo-space.png](images/04-demo-space.png) | admin | Built-in demo space: Sample data, not live provider evidence; light | Recapture |
| [05-create-runner.png](images/05-create-runner.png) | admin | Create runner: Full form; multiple configuration sections; light | Recapture |
| [06-members.png](images/06-members.png) | admin | Workspace members: Invited fictional people; light | Recapture |
| [07-accept-invite.png](images/07-accept-invite.png) | reviewer | Accept invitation: Before joining; no password entered; light | Recapture |
| [08-admin-home.png](images/08-admin-home.png) | admin | Administrator Home: Onboarding and workspace attention; light | Recapture |
| [09-overview.png](images/09-overview.png) | admin | Cross-space Overview: Situation counts and duplicate progress groups; light | Recapture |
| [10-space-settings.png](images/10-space-settings.png) | admin | Space settings: Repository, execution and advanced overrides; light | Recapture |
| [11-space-members.png](images/11-space-members.png) | admin | Space members and defaults: Privacy, maintainer, owner/reviewer defaults; light | Recapture |
| [12-agents.png](images/12-agents.png) | admin | Agents and runners: Active configurations, including missing keys; light | Recapture |
| [13-connections.png](images/13-connections.png) | admin | Connections: Configured and available integrations; light | Recapture |
| [14-secrets.png](images/14-secrets.png) | admin | Secrets: Credential metadata; values not revealed; light | Recapture |
| [15-notifications.png](images/15-notifications.png) | admin | Personal notifications: Slack unavailable; local email configured; light | Recapture |
| [16-audit-log.png](images/16-audit-log.png) | admin | Audit log: Administrative history; light | Recapture |
| [17-run-records.png](images/17-run-records.png) | admin | Run records: Execution history; light | Recapture |
| [18-new-space.png](images/18-new-space.png) | admin | Create space: New-space form; light | Recapture |
| [19-schedules.png](images/19-schedules.png) | admin | Space schedules: Empty configured schedules; light | Recapture |
| [20-runs.png](images/20-runs.png) | admin | Space runs: Execution listing; light | Recapture |
| [21-demo-research.png](images/21-demo-research.png) | admin | Demo research/task: Sample research and situation label; light | Recapture |
| [22-create-task.png](images/22-create-task.png) | pm | Create task form: Task/request input; light | Recapture |
| [23-pm-create-task.png](images/23-pm-create-task.png) | pm | PM task creation: Real main task requested through UI; light | Recapture |
| [25-reviewer-mention-picker.png](images/25-reviewer-mention-picker.png) | reviewer | Mention picker: Pointer works; ArrowDown/Enter defect reproduced; light | Recapture |
| [26-reviewer-posted.png](images/26-reviewer-posted.png) | reviewer | Posted feedback message: Mention addressed to Maria; light | Recapture |
| [27-reviewer-watching.png](images/27-reviewer-watching.png) | reviewer | Started watching: Reviewer added to watcher relationship; light | Recapture |
| [28-task-laptop.png](images/28-task-laptop.png) | pm | Task on laptop: 1280 × 800 viewport; light | Recapture |
| [29-task-tablet.png](images/29-task-tablet.png) | pm | Task on tablet: 768 × 1024 viewport; light | Recapture |
| [30-task-mobile.png](images/30-task-mobile.png) | pm | Task on mobile: 390 × 844 viewport; conversation far down page; light | Recapture |
| [31-task-dark.png](images/31-task-dark.png) | pm | Task in dark mode: Application-selected dark theme; dark | Recapture |
| [32-completed-empty-artifact.png](images/32-completed-empty-artifact.png) | admin | Completed without research: Pi probe completed with empty artifact; repeated on upgraded CLI; light | Recapture |
| [33-research-ready.png](images/33-research-ready.png) | pm | Research document and handback fan-out: Recaptured after handback; current research with three resumed sessions; light | Recapture |
| [34-inline-comment.png](images/34-inline-comment.png) | reviewer | Inline research comment: Selection and feedback composer; light | Recapture |
| [35-comment-in-thread.png](images/35-comment-in-thread.png) | reviewer | Comment preview in conversation: Quote shown, feedback omitted from preview; light | Recapture |
| [36-review-comments-panel.png](images/36-review-comments-panel.png) | reviewer | Research Comments view: Current comment body and document context; light | Recapture |
| [37-question-for-reviewer.png](images/37-question-for-reviewer.png) | reviewer | Agent blocking question: Real GLM question with answer control; light | Recapture |
| [38-question-answered.png](images/38-question-answered.png) | reviewer | Answered question: Human answer retained and continuation; light | Recapture |
| [39-login.png](images/39-login.png) | signed-out | Sign-in page: Empty fields; current app; light | Recapture |
| [40-mcp-servers.png](images/40-mcp-servers.png) | admin | MCP servers: Administrative capability configuration; light | Recapture |
| [41-skills.png](images/41-skills.png) | admin | Skills: Administrative capability configuration; light | Recapture |
| [42-api-tokens.png](images/42-api-tokens.png) | admin | API tokens: No token issued or revealed; light | Recapture |
| [43-prompt-templates.png](images/43-prompt-templates.png) | admin | Prompt templates: Reusable task instructions; light | Recapture |
| [44-runner-detail.png](images/44-runner-detail.png) | admin | Runner details: Harness, inferred model/provider and timestamps; light | Recapture |
| [45-task-failure.png](images/45-task-failure.png) | admin | Agent failure recovery: Codex authentication failure summarized generically; light | Recapture |
| [46-space-table.png](images/46-space-table.png) | admin | Space table view: Filter toolbar and task table; light | Recapture |
| [47-test-email.png](images/47-test-email.png) | admin | Test email result: Mailpit delivery verified; success message; light | Recapture |
| [48-custom-model-form.png](images/48-custom-model-form.png) | admin | Custom endpoint fields: OpenCode selected; mandatory catalog provider/key context; light | Recapture |
| [49-plan-ready.png](images/49-plan-ready.png) | pm | Real plan: GLM plan includes exact wording and regression test; light | Recapture |
| [50-demo-pull-request.png](images/50-demo-pull-request.png) | pm | Demo pull request: Sample PR presentation only; no real PR/merge; light | Recapture |
| [51-old-version-opens-current.png](images/51-old-version-opens-current.png) | reviewer | Old-version link opens current document: Clicked Research v1; current v2 shown; light | Recapture |
| [52-research-dark.png](images/52-research-dark.png) | reviewer | Research Comments in dark mode: Application-selected dark theme; dark | Recapture |
| [53-taken-over.png](images/53-taken-over.png) | pm | Taken over work: Task branch, checkout instructions and handback control; light | Recapture |
| [54-handed-back.png](images/54-handed-back.png) | pm | Handed back work: Three older sessions resumed unexpectedly; light | Recapture |
| [55-manually-done.png](images/55-manually-done.png) | pm | Manually completed task: Disposable STO-15; no PR implied; light | Recapture |
| [56-reopened.png](images/56-reopened.png) | pm | Reopened task: Disposable lifecycle task; light | Recapture |
| [57-archived.png](images/57-archived.png) | pm | Archived task: Returned to space board; light | Recapture |
| [58-notifications-content.png](images/58-notifications-content.png) | admin | Notification content: Browser element capture; excludes sidebar and demo banner; light | Candidate, content only |
| [59-watcher-stopped.png](images/59-watcher-stopped.png) | watcher | Stopped watching: Sam removed watcher relationship; light | Recapture |
| [60-watcher-watching.png](images/60-watcher-watching.png) | watcher | Watching again: Sam added watcher relationship; light | Recapture |
| [61-login-form.png](images/61-login-form.png) | signed-out | Sign-in form content: Browser form capture; empty fields; light | Candidate, content only |
| [engineer-home.png](images/engineer-home.png) | engineer | Engineer Home: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [engineer-notifications.png](images/engineer-notifications.png) | engineer | Engineer Notifications: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [engineer-overview.png](images/engineer-overview.png) | engineer | Engineer Overview: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [engineer-space.png](images/engineer-space.png) | engineer | Engineer Space: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [engineer-task.png](images/engineer-task.png) | engineer | Engineer Task: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [pm-home.png](images/pm-home.png) | pm | Pm Home: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [pm-notifications.png](images/pm-notifications.png) | pm | Pm Notifications: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [pm-overview.png](images/pm-overview.png) | pm | Pm Overview: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [pm-space.png](images/pm-space.png) | pm | Pm Space: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [pm-task.png](images/pm-task.png) | pm | Pm Task: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [reviewer-home.png](images/reviewer-home.png) | reviewer | Reviewer Home: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [reviewer-notifications.png](images/reviewer-notifications.png) | reviewer | Reviewer Notifications: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [reviewer-overview.png](images/reviewer-overview.png) | reviewer | Reviewer Overview: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [reviewer-space.png](images/reviewer-space.png) | reviewer | Reviewer Space: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [reviewer-task.png](images/reviewer-task.png) | reviewer | Reviewer Task: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [viewer-home.png](images/viewer-home.png) | viewer | Viewer entry: Overview: Requested Home route; Viewer redirected to Overview; light | Recapture |
| [viewer-notifications.png](images/viewer-notifications.png) | viewer | Viewer Notifications: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [viewer-overview.png](images/viewer-overview.png) | viewer | Viewer Overview: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [viewer-space.png](images/viewer-space.png) | viewer | Viewer Space: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [viewer-task.png](images/viewer-task.png) | viewer | Viewer Task: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [watcher-home.png](images/watcher-home.png) | watcher | Watcher Home: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [watcher-notifications.png](images/watcher-notifications.png) | watcher | Watcher Notifications: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [watcher-overview.png](images/watcher-overview.png) | watcher | Watcher Overview: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [watcher-space.png](images/watcher-space.png) | watcher | Watcher Space: Earlier journey snapshot; task data evolved during review; light | Recapture |
| [watcher-task.png](images/watcher-task.png) | watcher | Watcher Task: Earlier journey snapshot; task data evolved during review; light | Recapture |

## After the fixes

[after/](after/) holds `<persona>-<page>.png` for admin, pm, engineer, reviewer, watcher and viewer, on Home (viewers land on Overview), Overview, the Storefront space, task STO-7 and Notifications, captured on 2026-10-04 with `harness/capture.cjs` after the backlog was implemented. They show real fixture data, including the older compatibility-probe tasks and turns recorded before the fixes (their stored summaries keep the old wording). For public documentation, prefer a clean scenario as the reuse rules above say.

## Proposed UI

The [interactive prototype](mockups/index.html) has Home, Overview, Space, Task and Runner setup screens. It demonstrates persona capabilities, answer/feedback actions, versions and separate mobile Conversation/Artifact views with simulated data. It has no connection to the application and creates no real work.

| Mockup | Intent |
|---|---|
| [Home](mockups/home.png) | Separate needs-you requests from followed conversation updates |
| [Overview](mockups/overview.png) | Clear cross-space situation groups and counts |
| [Space](mockups/space.png) | Simple task list, compact filters and understandable situations |
| [Task](mockups/task.png) | Conversation and artifact side by side; compact people/details |
| [Runner setup](mockups/setup.png) | Model/protocol/key first, explicit simulated verification, advanced options collapsed |
| [Mobile conversation](mockups/task-mobile.png) | Conversation and next move reachable immediately |
| [Mobile artifact](mockups/artifact-mobile.png) | Read/review artifact in a separate mobile surface |

These seven images are **design proposals** and must never be used as screenshots of shipped behavior. The desktop mockups use 1440 × 1000; mobile uses 390 × 844. The image dimensions can be larger because full pages were captured. The mobile conversation image shows the simulated answered state; the desktop task shows the initial question.
