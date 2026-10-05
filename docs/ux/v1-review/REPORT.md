# UX assessment and journey coverage

Date: 2026-10-03 · Build: `ea71ba13994a6edb754e5fd61f0ee4f3adefebb0` · Environment: isolated local database and fixture repository.

> **Closed 2026-10-04.** Every finding below was implemented; see the resolution lines in [BACKLOG.md](BACKLOG.md) and the captures in [after/](after/). This report keeps the state as reviewed.

## Assessment

Viberglass now communicates its main objects through plain names: Home, Overview, Space, Task, and Settings. Work is grouped by situation, participants are visible, and human/agent messages share a thread. These are meaningful improvements over the historical audit. The visual language is consistent, with restrained cards and an amber accent.

It is close to a usable 1.0, but I would address the P0 items in [BACKLOG.md](BACKLOG.md) before presenting the app as ready. “Completed” can mean no requested artifact, “Active” can mean no usable model key, and opening an older artifact version actually shows the current document. Those contradictions undermine the user’s ability to make decisions. The most useful visual improvement is to give conversation, artifacts, and the next move a clearer hierarchy.

### What already works

- Workspace navigation stays available inside a space. Private spaces have a visible lock.
- Guest access is confined to invited spaces; unauthorized private-space reads returned 404. Secrets returned 403 for every non-admin tested. Viewer task posting and space creation returned 403.
- The PM could create a task without operating the runner settings. Human-readable keys such as `STO-7` survive sharing and navigation.
- A reviewer could accept an invite, mention the PM, watch a task, answer an agent’s question, select rendered text, and add an inline comment.
- A real agent used answered questions to revise research and included the reviewer’s regression-test feedback in the plan.
- Research and plans can be revised without a separate approval gate. Manual edits and code requests are attributed in the thread.
- Cancellation stopped the OpenCode review containers and left the turn history available. The old audit’s “cancel never stops anything” claim should not be repeated.
- Light-mode task layouts did not overflow horizontally at the tested widths. Dark mode is reachable from the account menu. Personal notification copy states whether email/Slack are configured.

## Information architecture

| Destination | Question it answers | Current friction |
|---|---|---|
| Home | What needs me, and what changed in my tasks? | Needs-you records, unread badge, and “Mark done” still need clearer distinctions; agent previews contain stitched/truncated technical prose. |
| Overview | What is happening across spaces I can see? | Live tasks repeat in In progress; Not started tasks are counted as In progress. |
| Space | What is happening here? | Search + four filters + More filters + Board/Table take substantial room before work. Groups are clearer than old phase columns. |
| Task | What has been said/made, and whose move is next? | Metadata precedes the conversation; mobile composer is far down the page; numbered artifact tabs suggest an obligatory pipeline. |
| Space settings | How does this space work? | Repository, tracker, credentials, branch overrides and auto-fix are presented together; privacy/defaults live on Members. |
| Workspace settings | How does the platform run? | Two identical “Settings” links compete in the sidebar; admin forms and Connections copy remain engineering/bug oriented. |
| Personal settings | How am I notified? | Mostly clear; Viewer copy mentions Home despite viewers landing in Overview. |

The proposed IA keeps these objects and destinations. Rename the two settings entries by scope, simplify setup to the essentials with expandable advanced options, make the task’s conversation the default mobile surface, and open version-specific artifacts explicitly. No new approval gates are proposed. [Mockups](mockups/index.html) show the resulting hierarchy.

## Persona journey coverage

| Persona / account | Entry and intended journey | What actually happened | Status |
|---|---|---|---|
| Admin / Alex | Empty instance → first account → setup → workspace configuration → members → diagnostics | Registration and demo worked. `.test` email was refused with generic Validation error. No custom model provider in setup; GLM runners needed API/config-file setup. Members, connections, secrets, tools, templates, records and audit pages inspected. Test email reached Mailpit. | Live + configuration bypass documented |
| PM / Maria | Home → create task → assign participants → ask research → answer/coordinate → plan → build | Created `STO-7` through the form. Owner defaulted to creator. Reviewer and watcher were assigned via API as fixtures. Mentions appeared in Home. Research, answers, revisions and a plan were live. Code reached push failure against the read-only local repository. | Live through local publication boundary |
| Engineer / Dev | Space → task → inspect artifacts → take over / hand back → diagnostics | Maintainer navigation and controls inspected. Run/space settings readable. Task steering endpoints and UI entry points inspected; takeover/handback were exercised on the main fixture using the PM owner’s credentials; Dev’s maintainer controls were inspected. Interrupt was inspected in source, not executed as a separate live turn. | Live controls; no external branch checkout/merge |
| Reviewer / Quinn | Invite → Home → assigned task → rendered artifact → feedback → question answer | Invite accepted through UI. Added an @mention, watched the task, answered two blocking questions, selected research text and posted feedback. Plan included feedback. “Open Research v1” still displayed the current v2 content. | Live; version defect |
| Watcher / Sam | Task → Watch → follow on Home → read updates → Stop watching | Watch membership seeded; Sam used Stop watching and Watch again through the UI. A watcher is a task participant, not a read-only role: the member account can comment and request code on this task. | Live; semantics need explanation |
| Viewer / Taylor | Login → Overview → visible space/task → read artifacts | Login landed on Overview. Private space invisible. Create/comment/agent controls hidden and writes refused. Empty artifact text still instructs them to ask/write, and Notifications mentions unavailable Home. | Live; misleading empty-state copy |
| Individual non-engineer / member capability | Choose a space → describe desired outcome → agent helps → review result | PM’s simple greeting request exercises the same capability path. Task input is plain language, but setup forms require API/config knowledge and Build action hides which runner will be chosen. No separate recruited solo-user session was conducted. | Shared capability path; expert assessment |

Workspace roles and task participation are separate. PM and engineer are personas, not workspace role values; reviewer and watcher are per-task participation. Guest reviewers can ask for code when on the task. Viewers cannot watch in the current UI. Guides explicitly preserve these distinctions.

## State and edge-case coverage

| State / operation | Evidence and limit |
|---|---|
| Fresh setup / demo | Real empty DB and admin registration; model-provider menu inspected. Demo is explicitly labeled sample data. Full native-provider wizard path was not executed because only z.ai credentials were supplied. |
| No task / no artifact | Role-specific Home and task empty states captured. Viewer guidance is not role aware. |
| Agent working | Real Claude/OpenCode turns; working status and composing during a turn inspected. |
| Agent question | Real ask_human calls addressed Quinn and Maria; Quinn answered through UI, including a question addressed to Maria. The UI intentionally permits any person who can post to answer. Attribution is retained. |
| Research / revised research / plan | Real z.ai-backed Claude output. Inline feedback was reflected in the plan. Context-resume labels appeared in thread. |
| Historical artifact | Two research versions existed; Open Research v1 showed the current document. Backend revision records exist; the UI callback passes only the artifact kind. |
| Code / PR | Real code turn failed at pushing to the read-only dumb-HTTP fixture. Failure code: REPOSITORY_WRITE_FAILED. Demo PR panel inspected; no real remote PR or merge was performed. |
| Completed without artifact | Pi reproduced this with both inherited 0.99.2 and upgraded 1.x CLI images: success=true and zero research characters, with no blocking question. |
| Error / retry | Codex and Kimi returned Authentication required; Qwen Internal error. Public UI condensed them into generic Agent failed. Retry and takeover entry points inspected. |
| Cancel | OpenCode containers stopped; history retained. A partial research artifact was available by cancellation. The run did not reach a clean terminal result during the review. |
| Pause / resume / handover | Pause applied to an existing paused failure; takeover authenticated through API, handback through UI resumed it. Handback unexpectedly resumed three old paused sessions; the two research sessions failed and Claude completed with no changed files or PR (UX-26). No live pause/interrupt stress test or successful external push is claimed. See steering-results.json. |
| Done / reopen / archive | Exercised on a separate “Lifecycle review fixture” through the task Actions menu; historical records retained. This is manual closure, not proof of a merged PR. |
| Email / Slack | Invite emails and an admin test email delivered to local Mailpit. Slack unconfigured-state screens inspected; OAuth linking, DMs, remote Slack submission and reminders not exercised. |
| Visibility | Non-admin reads of the private fixture returned 404. Guest saw only Storefront; members/viewer saw open spaces and not the private fixture. |

## Visual and interaction findings

The default cream gradient, dashed top edge and broad pale background are consistent, but compete with the amber states. Use neutral surfaces, preserve the accent for attention and primary actions, and strengthen spacing/typography hierarchy. This is a design recommendation, not a measured contrast failure.

On desktop, the task puts several competing mini-panels above the thread. On mobile, artifact preview, Details and People precede the conversation. A conversation/artifact switch and collapsed details would reduce the distance to the next move. The proposed task mockup preserves the useful participant information in a compact header.

Runner creation fills several desktop screens: harness cards, provider/key, compute cards, instructions, tools, and secrets. Those are legitimate admin settings, but most do not need equal prominence. Default compute and fold rarely changed configuration into Advanced. Before a run, show the selected harness/provider/model and whether it starts fresh.

Task @mention selection worked with a pointer. ArrowDown + Enter left `@` unchanged instead of selecting a suggestion. The artifact-view tab group has incorrect ARIA children. See [accessibility-results.json](accessibility-results.json): automated scans passed other tested routes, but contrast checks were **incomplete** because of backgrounds. This is not a WCAG conformance certification. Keyboard focus, touch target sizing, gradient-backed contrast and version-view focus need a manual follow-up.

## Screen inventory

Captured: registration and validation, login, setup model step, demo board/task/PR, role-specific Home/Overview/Space/Task/Notifications, new space, space general settings and members, board and table, create task, working/question/answered/research/comment/plan/failure states, task menus and lifecycle, Agents list/create/detail/custom-model form, Connections, Secrets, MCP servers, Skills, Prompt templates, API tokens, Run records, Audit log, Runs and Schedules. See [gallery.html](gallery.html) for files and [SCREENSHOTS.md](SCREENSHOTS.md) for reuse decisions.

## Evidence discipline and limitations

API-created fixture people/runners/space links supplement UI-driven journeys; they do not demonstrate that the UI can create the same custom configuration. All submitted content and repositories were fixtures. The initial inherited worker image lacked the newly registered Antigravity package; the overlay was corrected and those bootstrap attempts were excluded from provider compatibility results. The separate Pi upgrade retry confirms its empty-output finding is not solely the inherited CLI version.

Provider names on review runners identify catalog bindings, while the configured endpoint was z.ai for compatible harnesses. A successful GLM run is not a validation of Anthropic/OpenAI/Alibaba/etc. native services. Run manifests did not report actual model identity, token counts or measured cost for the successful Claude turns, so those measurements remain unknown.

Old findings were not treated as current defects without reproduction. Human-subject usability testing, production deployment, native-provider credentials, external integrations, and merged-PR lifecycle verification remain follow-up work.
