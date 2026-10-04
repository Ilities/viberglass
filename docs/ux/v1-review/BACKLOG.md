# UX/UI implementation backlog

These are proposed changes, not fixes shipped by this review. Priority reflects release risk: **P0** undermines trust in work/results; **P1** materially obstructs a common journey; **P2** improves clarity and polish. Effort is intentionally unestimated until implementation design. All boxes remain open.

## Contents

- [Release sequence](#release-sequence)
- [Confirmed findings](#confirmed-findings)
- [Follow-up validation](#follow-up-validation)

## Release sequence

1. Establish truthful artifact/version/readiness states (UX-01–03).
2. Make selection, custom configuration and failure recovery usable (UX-04–07).
3. Correct situation counts, mobile/keyboard/review interactions and language (UX-08–18).
4. Scope handoff to the intended session (UX-26).
5. Apply the visual proposals and secondary simplifications (UX-19–25).
6. Recapture documentation screenshots only after their screen is accepted.

## Confirmed findings

### UX-01 · P0 · Prevent successful artifact requests with no artifact

- [ ] **Affected:** PM, reviewer. **Evidence:** [32-completed-empty-artifact.png](images/32-completed-empty-artifact.png).
- **Reproduce / observation:** Ask Pi for research on STO-13 or STO-14. Both completed successfully, with zero document characters and no blocking question.
- **Change:** Validate expected outcomes against the action. Record an actionable incomplete result when research/plan is absent; preserve valid question-only turns as waiting for an answer.
- **Accept when:** Research/plan completion points to a nonempty revision or a visible question. Regression covers empty output, real question, partial output and cancellation.
- **Starting points:** [TaskTurnOutcomeService.ts](../../../apps/platform-backend/src/services/taskTurns/TaskTurnOutcomeService.ts). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-02 · P0 · Open the artifact version named by the link

- [ ] **Affected:** Reviewer, engineer. **Evidence:** [51-old-version-opens-current.png](images/51-old-version-opens-current.png).
- **Reproduce / observation:** Create two research revisions on STO-7, then click Open Research v1. The pane displays current v2 wording and Last changed.
- **Change:** Pass the revision identifier through the thread callback; open a read-only version with version number, author/time, Current link and optional comparison.
- **Accept when:** v1 and v2 show their respective contents. Old-version comments are attributed to their revision; changing views never silently substitutes the current document.
- **Starting points:** [task-thread.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-thread.tsx); [TicketDetailPage.tsx](../../../apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-03 · P0 · Separate compute availability from runner readiness

- [ ] **Affected:** Admin, PM. **Evidence:** [12-agents.png](images/12-agents.png).
- **Reproduce / observation:** Open Agents after adding an image-backed Google/Mistral configuration with no key. Active coexists with No usable model key.
- **Change:** Show separate configured/provisioned/authenticated states and a bounded model/tool/artifact check. Exclude unverified/unusable runners from silent automatic selection.
- **Accept when:** Missing keys never produce a Ready-to-use signal. PM can see readiness before asking; diagnostic checks produce a safe actionable result.
- **Starting points:** [clanker-health.tsx](../../../apps/platform-frontend/src/pages/clankers/clanker-health.tsx); [modelProviderAvailability.ts](../../../apps/platform-backend/src/services/setup/modelProviderAvailability.ts). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-04 · P1 · Show the selected agent before starting work

- [ ] **Affected:** PM, requester. **Evidence:** [23-pm-create-task.png](images/23-pm-create-task.png).
- **Reproduce / observation:** The default Write research selected the first available Qwen runner and failed. The composer did not explain the effective model.
- **Change:** Show the resolved runner/harness/model next to the ask action, with an accessible change control and fresh/resumed context indication. Respect space defaults and validated readiness.
- **Accept when:** An automatic selection is visible and predictable; an unready runner cannot silently win. Unknown effective model is displayed as unknown rather than inferred as a native model.
- **Starting points:** [task-composer.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-composer.tsx); [TaskTurnAgentResolver.ts](../../../apps/platform-backend/src/services/taskTurns/TaskTurnAgentResolver.ts). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-05 · P1 · Make custom endpoints a supported setup path

- [ ] **Affected:** Admin. **Evidence:** [48-custom-model-form.png](images/48-custom-model-form.png).
- **Reproduce / observation:** The setup model picker has no z.ai/custom provider. Existing endpoint fields still require a catalog-provider key binding; review configuration needed API calls and files.
- **Change:** Add protocol-aware custom providers and generic model keys. Preserve harness-specific capabilities. Distinguish Chat Completions, Responses and Anthropic protocols; do not promise universal compatibility.
- **Accept when:** A supported custom harness/model can be created and verified through the UI without pretending its credential belongs to another vendor. Unsupported combinations explain the limitation.
- **Starting points:** [ModelKeyStep.tsx](../../../apps/platform-frontend/src/pages/setup/ModelKeyStep.tsx); [ModelSection.tsx](../../../apps/platform-frontend/src/pages/clankers/runner-form/ModelSection.tsx); [agentProviderCatalog.json](../../../packages/types/src/agentProviderCatalog.json). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-06 · P1 · Allow one secret to bind to multiple aliases

- [ ] **Affected:** Admin. **Evidence:** [14-secrets.png](images/14-secrets.png).
- **Reproduce / observation:** POST a runner with two env bindings pointing to the same existing secret id. Validation rejects it with Secrets not found: and no missing identifiers. Separate secret records worked.
- **Change:** Deduplicate ids before existence validation; report only genuinely missing ids with a useful form error.
- **Accept when:** Two aliases may reference one secret. One unknown id still fails. Error copy never contains the secret value.
- **Starting points:** [ClankerDAO.ts](../../../apps/platform-backend/src/persistence/clanker/ClankerDAO.ts). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-07 · P1 · Turn failures into a clear recovery handoff

- [ ] **Affected:** PM, admin, engineer. **Evidence:** [45-task-failure.png](images/45-task-failure.png).
- **Reproduce / observation:** Codex/Kimi Authentication required and Qwen Internal error become Agent failed. The person sees retry but little guidance about credentials, protocol or who can repair them.
- **Change:** Distinguish auth, unsupported configuration, worker, repository and model failures. Name the person/scope that can fix the issue, provide scoped diagnostics, and retain the submitted request.
- **Accept when:** PM sees why work stopped and the next owner/action. Admin sees safe technical detail and a targeted settings link. Retrying unchanged auth configuration does not imply a likely fix.
- **Starting points:** [RunFailureHandler.ts](../../../apps/platform-backend/src/services/taskTurns/RunFailureHandler.ts); [agent-steering.tsx](../../../apps/platform-frontend/src/pages/project/tickets/agent-steering.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-08 · P1 · Make situation labels and Overview counts truthful

- [ ] **Affected:** All personas. **Evidence:** [09-overview.png](images/09-overview.png).
- **Reproduce / observation:** Overview counts Not started tasks as In progress and repeats live work in another section. Demo DAS-1 has research/plan but its heading remains Not started.
- **Change:** Define distinct counted categories from task facts and use the same derivation in row, header, Overview and demo. Include artifact availability in situation explanations.
- **Accept when:** Fixture set with unstarted, live, waiting, failed, artifact-ready, done and archived work has predictable counts. Any overlap is explicitly labeled and totals are not misleading.
- **Starting points:** [OverviewService.ts](../../../apps/platform-backend/src/services/home/OverviewService.ts); [TaskSituationService.ts](../../../apps/platform-backend/src/services/tasks/TaskSituationService.ts); [OverviewPage.tsx](../../../apps/platform-frontend/src/pages/overview/OverviewPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-09 · P1 · Put the conversation and next move first on mobile

- [ ] **Affected:** PM, reviewer, requester. **Evidence:** [30-task-mobile.png](images/30-task-mobile.png).
- **Reproduce / observation:** At 390 px the artifact, Details and People push the thread and composer far below the first screen.
- **Change:** Provide Conversation/Artifact views, compact participants, collapsed details, and a visible contextual next action. Keep desktop conversation/artifact split.
- **Accept when:** At 390 px a user can read the latest turn and reach the compose/answer action without traversing unrelated panels. No horizontal overflow; focused input survives view changes.
- **Starting points:** [TicketDetailPage.tsx](../../../apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-10 · P1 · Fix keyboard mention selection

- [ ] **Affected:** Reviewer, keyboard users. **Evidence:** [25-reviewer-mention-picker.png](images/25-reviewer-mention-picker.png).
- **Reproduce / observation:** Type @, press ArrowDown and Enter. The composer retains @ and adds a newline; selecting with a pointer works.
- **Change:** Implement accessible suggestion navigation, selection, Escape and focus retention; preserve literal Enter behavior when the picker is closed.
- **Accept when:** Keyboard and pointer produce the same mention target; Home receives the attributed mention. Check with a screen reader and the ARIA combobox pattern.
- **Starting points:** [task-composer.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-composer.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-11 · P1 · Give artifact tabs valid semantics and focus behavior

- [ ] **Affected:** Keyboard and assistive-technology users. **Evidence:** [36-review-comments-panel.png](images/36-review-comments-panel.png).
- **Reproduce / observation:** axe reports aria-required-children on the Research views tablist: children are ordinary buttons.
- **Change:** Implement tabs with selected state, associated panels and keyboard navigation, or use plain button-group semantics consistently if these are not tabs.
- **Accept when:** axe required-children violation is gone. Arrow keys, focus indication and announced active view work for Research/Plan/Comments in light and dark themes.
- **Starting points:** [task-step-view.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-step-view.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-12 · P1 · Separate acknowledging a mention from finishing a task

- [ ] **Affected:** PM, reviewer, watcher. **Evidence:** [55-manually-done.png](images/55-manually-done.png).
- **Reproduce / observation:** Home has Mark done for a needs-you record; task Actions has Mark as done for task closure. Home badge says unread while representing needs-you items.
- **Change:** Use explicit labels such as Acknowledge mention and Finish task; explain unread, needs-you, ownership and watching separately. State when manual closure does not imply a merged PR.
- **Accept when:** Acknowledging an item leaves task status unchanged. Finishing/reopening retains history and explains its outcome. Counts and row labels use consistent meanings.
- **Starting points:** [mark-mention-done.tsx](../../../apps/platform-frontend/src/components/mark-mention-done.tsx); [HomePage.tsx](../../../apps/platform-frontend/src/pages/home/HomePage.tsx); [task-actions-menu.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-actions-menu.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-13 · P1 · Show the reviewer’s feedback beside the quoted text

- [ ] **Affected:** Reviewer, PM. **Evidence:** [35-comment-in-thread.png](images/35-comment-in-thread.png).
- **Reproduce / observation:** Quinn posted a research comment. The conversation preview says commented on research and shows the truncated quote; it omits the feedback itself.
- **Change:** Render author, comment body, concise quote context and a link to the anchored comment. Make open/resolved state clear.
- **Accept when:** A reader understands the requested change from the thread without opening Comments; the anchor/version remains identifiable. Long quotes do not displace feedback.
- **Starting points:** [task-thread.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-thread.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-14 · P1 · Clarify artifact navigation without an implied approval pipeline

- [ ] **Affected:** Requester, PM. **Evidence:** [49-plan-ready.png](images/49-plan-ready.png).
- **Reproduce / observation:** Research 1 / Plan 2 / Code 3 reads as mandatory sequential steps, although direct code requests and revisions are supported.
- **Change:** Use artifact names/status/version counts without step numbers. Explain research and planning as useful options; keep code readiness and publication state distinct.
- **Accept when:** A new user can request code directly, review available artifacts and revise them without seeking a nonexistent approval gate.
- **Starting points:** [task-stepper.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-stepper.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-15 · P1 · Simplify runner creation and verification

- [ ] **Affected:** Admin. **Evidence:** [05-create-runner.png](images/05-create-runner.png).
- **Reproduce / observation:** New Agent spreads basic selection, compute, tools, instructions, files and secrets across multiple desktop screens with similar prominence.
- **Change:** Group identity/model/key first, retain sensible default compute, fold advanced options, and make Create and verify the clear end action.
- **Accept when:** A supported default runner is created without scrolling through every strategy field. Advanced configuration remains available and failures preserve input.
- **Starting points:** [RunnerForm.tsx](../../../apps/platform-frontend/src/pages/clankers/runner-form/RunnerForm.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-16 · P1 · Make repository and space setup understandable

- [ ] **Affected:** Admin, maintainer. **Evidence:** [10-space-settings.png](images/10-space-settings.png).
- **Reproduce / observation:** Space settings mix ticketing, bug tracking, SCM, execution, PR overrides and template placeholders. Privacy/default membership are on Members.
- **Change:** Lead with space identity/access and repository/branch. Group integrations separately and fold branch/PR overrides and automation. Provide human-readable examples.
- **Accept when:** An admin can identify repository, default branch and membership policy without knowing SCM terminology or template variables. Validation errors explain corrective input.
- **Starting points:** [ProjectSettingsPage.tsx](../../../apps/platform-frontend/src/pages/project/settings/ProjectSettingsPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-17 · P1 · Disambiguate settings scope and connection terminology

- [ ] **Affected:** Admin, maintainer. **Evidence:** [11-space-members.png](images/11-space-members.png).
- **Reproduce / observation:** Inside a space the sidebar has two Settings entries. Connections opens a page titled Integrations with references to projects and bugs.
- **Change:** Name Space settings, Workspace settings and Personal settings by scope. Standardize Space and Connections labels and align page titles, breadcrumbs and help copy.
- **Accept when:** A persona can predict the destination and permission scope before clicking. The same object uses the same name across navigation and forms.
- **Starting points:** [SettingsLayout.tsx](../../../apps/platform-frontend/src/layouts/SettingsLayout.tsx); [WorkspaceSettingsLayout.tsx](../../../apps/platform-frontend/src/layouts/WorkspaceSettingsLayout.tsx); [IntegrationsPage.tsx](../../../apps/platform-frontend/src/pages/settings/IntegrationsPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-18 · P1 · Write empty states for the viewer’s actual capabilities

- [ ] **Affected:** Viewer, guest. **Evidence:** [viewer-task.png](images/viewer-task.png).
- **Reproduce / observation:** A viewer sees empty artifacts telling them to ask/write/build, while the controls are absent. Notifications mentions Home though viewers land on Overview.
- **Change:** Generate next-action copy from capabilities. For read-only users explain who can produce the artifact and where visible updates can be followed.
- **Accept when:** No read-only screen instructs a viewer to perform a forbidden action. Links resolve to accessible destinations and preserve the intended read-only path.
- **Starting points:** [task-step-view.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-step-view.tsx); [NotificationSettingsPage.tsx](../../../apps/platform-frontend/src/pages/settings/NotificationSettingsPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-19 · P2 · Use neutral surfaces and stronger visual hierarchy

- [ ] **Affected:** All personas. **Evidence:** [28-task-laptop.png](images/28-task-laptop.png).
- **Reproduce / observation:** Cream gradient, dashed top edge and broad amber surfaces compete with status/attention colors. This is a visual assessment, not a measured contrast failure.
- **Change:** Use neutral backgrounds, reserve amber for attention/primary actions, reduce decorative boundaries and create consistent type/spacing hierarchy.
- **Accept when:** Compare all mockup screens at desktop/mobile and both themes. Measure contrast manually where automated checks were incomplete; preserve recognizable brand cues.
- **Starting points:** [TicketDetailPage.tsx](../../../apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-20 · P2 · Reduce task metadata and filter chrome

- [ ] **Affected:** PM, requester. **Evidence:** [46-space-table.png](images/46-space-table.png).
- **Reproduce / observation:** Category/severity and several panels precede work; Space search plus filters, More filters and view controls dominate the toolbar.
- **Change:** Collapse secondary task details and progressively reveal space filters. Keep active-filter chips and clear/reset controls visible.
- **Accept when:** Default task/space shows more useful work within one viewport; every existing filter remains reachable and selected filters remain legible.
- **Starting points:** [TicketDetailPage.tsx](../../../apps/platform-frontend/src/pages/project/tickets/TicketDetailPage.tsx); [ProjectDetailPage.tsx](../../../apps/platform-frontend/src/pages/project/space/SpacePage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-21 · P2 · Write useful turn summaries and question handoffs

- [ ] **Affected:** PM, reviewer, watcher. **Evidence:** [37-question-for-reviewer.png](images/37-question-for-reviewer.png).
- **Reproduce / observation:** Turn previews stitch together clipped technical prose; questions are duplicated in history and answer cards far below. Any permitted poster may answer even when another person is named.
- **Change:** Summarize result/blocker/next move in plain sentences. Keep one prominent answer location and historical attribution; explain that others may help answer. Keep raw agent logs in diagnostics.
- **Accept when:** Home rows and task turns read as complete sentences. Questions show addressee and actual responder, answer state and resulting continuation without duplicating unanswered calls to action.
- **Starting points:** [home-thread-row.tsx](../../../apps/platform-frontend/src/pages/home/home-thread-row.tsx); [task-thread.tsx](../../../apps/platform-frontend/src/pages/project/tickets/task-thread.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-22 · P2 · Explain roles independently of task participation

- [ ] **Affected:** Admin, reviewer, watcher. **Evidence:** [06-members.png](images/06-members.png).
- **Reproduce / observation:** Guest role invite text understates that a participant may ask for code. Watcher is a participant, not a read-only privilege. PM/reviewer are not workspace roles.
- **Change:** Add a short capability table to invites and People help. Explain member/guest/viewer, maintainer, owner, reviewer and watcher separately; do not silently change permissions.
- **Accept when:** Invitees and admins can predict viewing, commenting, agent requests and steering. Wording matches taskAskPolicy, including guest participants and viewers.
- **Starting points:** [taskAskPolicy.ts](../../../packages/types/src/taskAskPolicy.ts). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-23 · P2 · Simplify connection cards and contain demo guidance

- [ ] **Affected:** Admin, experienced users. **Evidence:** [13-connections.png](images/13-connections.png).
- **Reproduce / observation:** Connections shows Configured/Available/Ready totals and Coming soon noise. Demo onboarding banner remains in real workspace/task screens.
- **Change:** Use status per connection with its next action. Explain unavailable connections when relevant. Make demo guidance dismissible/contextual without deleting sample data.
- **Accept when:** Admin can identify a broken connection at a glance; normal work is not visually dominated by onboarding. Setup remains discoverable.
- **Starting points:** [IntegrationsPage.tsx](../../../apps/platform-frontend/src/pages/settings/IntegrationsPage.tsx); [demo-workspace-banner.tsx](../../../apps/platform-frontend/src/components/demo-workspace-banner.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-24 · P2 · Report effective model and timestamp provenance

- [ ] **Affected:** Admin, engineer. **Evidence:** [44-runner-detail.png](images/44-runner-detail.png).
- **Reproduce / observation:** Runner detail can infer a native provider from its key alias even though environment overrides use GLM. Created and Updated appeared two hours apart in reverse order.
- **Change:** Show requested versus reported effective model/protocol, unknown telemetry explicitly, and consistent timestamp timezone parsing/formatting.
- **Accept when:** Updated never appears earlier than Created solely because of timezone conversion. A custom runner is not presented as a verified native model; missing usage/cost stays unknown.
- **Starting points:** [runnerSummary.ts](../../../apps/platform-frontend/src/pages/clankers/config/runnerSummary.ts); [ClankerDetailPage.tsx](../../../apps/platform-frontend/src/pages/clankers/ClankerDetailPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-25 · P2 · Make form validation actionable

- [ ] **Affected:** First admin, invitee. **Evidence:** [02-registration-validation.png](images/02-registration-validation.png).
- **Reproduce / observation:** First-admin registration with a .test address showed generic Validation error. Valid example.com fixture addresses worked.
- **Change:** Surface field-specific validation next to the input, preserve values and describe accepted email format. Review invite role sentence grammar.
- **Accept when:** Invalid fields are announced and focusable; valid values survive errors; the error distinguishes format validation from delivery failure.
- **Starting points:** [SetupPage.tsx](../../../apps/platform-frontend/src/pages/setup/SetupPage.tsx). Locations are investigation entry points, not a prescribed implementation boundary.

### UX-26 · P1 · Resume only the intended handoff session

- [ ] **Affected:** Engineer, task owner. **Evidence:** [Handback fan-out](images/54-handed-back.png), [resumed sessions](images/33-research-ready.png), [steering-results.json](steering-results.json).
- **Reproduce:** STO-7 had failed/cancelled sessions from Qwen, OpenCode and Claude. Pause/takeover followed by one Hand back resumed all three with the same note, including old research actions. The two research sessions failed; Claude completed with no changed files or PR. No successful publication was claimed.
- **Change:** Track the intended agent/session and paused reason for a handoff. Offer explicit recovery for older failed sessions rather than resuming every paused session with the same note.
- **Accept when:** Handback resumes exactly the selected work once. Switching agents and retaining failed history does not create unexpected model requests. Users can see which session and action will resume.
- **Starting point:** [TaskSteeringService.ts](../../../apps/platform-backend/src/services/taskTurns/TaskSteeringService.ts). Resume currently iterates every paused session for the task.

## Follow-up validation

- Test a real writable repository through branch publication, PR review, merge, task closure and reopening. The review used a read-only local fixture and a sample PR.
- Test native-provider credentials separately from custom GLM endpoints, including failed-key replacement and timeouts. Keep configuration-only catalog bindings distinct from proven executions.
- Manually check contrast, focus order, focus restoration, dialogs, keyboard tabs, touches and screen-reader reading order in both themes. Automated contrast checks were incomplete.
- Recruit one first-time admin, PM, reviewer and read-only stakeholder. Ask them to configure a supported runner, identify their next move, give feedback, and explain task completion without guidance. Record task success, uncertainty and time to useful action.
- Verify live Slack linking, reminders, long-context recovery and supported cloud compute after their respective environments are available.

The keyboard acceptance work should follow the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Automated evidence is in [accessibility-results.json](accessibility-results.json); a passing route is not a conformance claim. The [mockups](mockups/index.html) illustrate UX-02, 04, 08, 09, 12, 14–17 and 19–21. Every mockup is a proposal with simulated data.
