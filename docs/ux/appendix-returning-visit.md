# Returning-visit walkthrough (Phase 2½ research, RA/RM/RD/RT/RV series)

Walkthrough performed 2026-10-01 on the local dev stack, after Phase 2, as five people on one seeded workspace. It's the research step of plan §12 Phase 2½; the redesign it feeds is [`returning-visit-redesign.md`](./returning-visit-redesign.md). Screenshots: `/tmp/ux/p25-<persona>-NN-*.png` (local, not committed).

**Workspace.** Seeded through the public API by `/tmp/ux-p25/seed.mjs` (local, not committed), with real runs by the fake agent against the dev GitHub connection (research and plan runs only, which push nothing):
- **Web shop** (open; Dev is the default owner, Tomi the default reviewer) and **Payments** (private; Jussi and Dev), next to the older UX Walkthrough and Live Verification Project spaces.
- People, invited by link: **Jussi** (admin, acting PM), **Maria PM** (member, requester), **Dev Koskinen** (member engineer, owner of everything in Web shop), **Kaisa Designer** (member), **Tomi Laine** (guest, Web shop only), **Eero Salo** (viewer).
- Tasks: WS-1 plan awaiting Tomi (with his comment on it) · WS-2 research awaiting approval, with @mentions in the Discussion · WS-3 research failed · WS-4 not started · WS-5 plan approved, PR open · WS-6 agent working · WS-7 done · PAY-1 research awaiting approval (private space).
- Document text was replaced with realistic content after each run (the fake agent echoes its prompt), and the WS-5/WS-7 pull request links were set in the database, so their PR panels say "Unknown". WS-6's `[fake:sleep]` run was failed by the heartbeat sweeper after about 5 minutes ("Agent stopped responding"), so later screens show it as failed.

Severity: **S1** blocks or misleads the journey · **S2** major friction · **S3** polish · **+** works well.

## Across all five people

1. **Nobody lands where their work is.** Everyone signs in to `/`, the workspace Dashboard: counters, space cards, a feed of run and task records, and an Agents panel. It names no task waiting on the person (RA1, RM1, RD1, RT1, RV1).
2. **Only the task page knows a task's state, and it doesn't know who's looking.** The board, table, space home, Pulse, sidebar and My tasks read the stored status (open · in progress · in review · resolved), which ignores failed runs, open PRs and who's being waited on. So a failed task and a task with an open PR both read "Open", the space home leaves the failed one out and files the PR one under "Not started" (RA16, RA21, RM16, RM19, RD20, RD25, RT16, RT20, RV9, RV13). The task page derives the truth from runs, documents and the session, but its banner says "Your move" to every viewer, viewers and guests included, then "Waiting on Tomi" underneath (RA24, RM23, RD27, RT23, RV16).
3. **The Inbox announces events, and they go stale.** "The plan is ready" stays open after the plan is approved or the task is done (RA6, RT6, RD8). Research never sends a review request, so a requester's or owner's real move (approve WS-2, PAY-1) is filed under "Updates" (RM6, RD7). My tasks treats owning a task as having the move: Dev's "Waiting on you · 6" includes a plan waiting on Tomi and a PR (RD14), while Maria's WS-2 is "Waiting on others" (RM9).
4. **One state has up to six names.** Open / Not started / Next step / Open Issues; Awaiting review / ready for your review / Your move; Resolved / Recently resolved / Done; Research · Planning · Execution against Research · Plan · Build. "Open tasks" is counted three ways and the space cards say "0 failed" next to a failure (RA2, RD2, RV2).
5. **The UI is the same for every role; only the server differs.** Viewers and guests are offered create, run, archive, delete, edit and approve-request actions and refused afterwards (RV14, RV17, RV23, RT21, RT23, RT24). Members reach runner pages with Deactivate/Delete from the dashboard's Agents panel (RM2, RD35), read-only space settings show editable SCM and credential fields (RM35, RV24), and Settings opens on API tokens for people who can't use them (RM13, RV26, RT33).
6. **Entering a space replaces the sidebar.** Pulse, the other spaces and workspace Settings disappear, "Dashboard" changes meaning and the accent colour changes (RA13, RM12, RD18, RT13, RV12). Pulse is titled "Action Required" but is a workspace pipeline list without owners, failures or PRs (RA11, RD16, RV7).
7. **What works:** the task page's stepper (right on every task for every person), Activity in plain attributed sentences, the People sidebar, the rendered plan with comment highlights, the Discussion, the home checklist and Notifications settings.

## Bugs found on the way (verified)

| # | Sev | Bug |
|---|---|---|
| RB1 | S1 | **Guests, and members not on a task, can edit, hard-delete, archive and set the status of any task they can see.** `PUT /api/tasks/:id`, `DELETE /api/tasks/:id`, `POST /api/tasks/archive` and `/unarchive`, and `POST /api/tasks/:id/set-status` have no role check beyond space visibility (`routes/tickets/crudMediaRoutes.ts:431`, `:468`, `:363`, `:384`; `routes/tickets.ts:110`); only the global viewer guard applies. Verified: Tomi's guest account renamed and deleted a throwaway task Dev had created (both 200). The §4 matrix reserves hard delete for admins. |
| RB2 | S1 | **Space integrations are broken since the §2.1 rename.** `service/api/integration-api.ts:151, 171, 198, 217` still call `/api/integrations/project/:id/…`; the API is `/api/integrations/space/:id/…`. Every space's settings say "Failed to fetch space integrations" with an empty SCM dropdown, for admins too, and linking, unlinking and setting the primary connection from space settings fail. |
| RB3 | S2 | The task banner's review cards hard-code `owner="you" eyebrow="Your move"` (`task-next-move-banner.tsx:165`, `:196`, `:287`), whether or not the viewer can approve. |
| RB4 | S2 | A private or unknown space (`/spaces/payments` for a non-member) shows the loading joke forever instead of "not found" (RM15, RT33, RV28). |
| RB5 | S2 | A heartbeat-swept run reaches admins as "failed **because of setup**: Agent stopped responding" under Failures you own, while the task page calls the same run an agent failure with Try again (RA8). Possibly a classification question rather than a bug; the fake agent's long sleep doesn't send heartbeats, which is how it was found. |
| RB6 | S2 | **A swept run's worker keeps running.** WS-6's Docker worker (`[fake:sleep=5400]`) was still up about an hour after the heartbeat sweeper failed the run; it was stopped by hand. The sweeper marks the job failed but doesn't call the worker stopper (J12, handover §3.7). |


---

## Returning-visit walkthrough: admin PM (RA series)

2026-10-01, dev stack, as **Jussi** (`jussi@hallila.com`, workspace admin acting as PM). Seed `/tmp/ux-p25/seed.mjs`: Web shop (open; Dev default owner, Tomi default reviewer) and Payments (private), plus the older UX Walkthrough and Live Verification Project spaces. Screenshots: `/tmp/ux/p25-admin-NN-*.png`.

State caveats: WS-6's `[fake:sleep]` run was failed by the heartbeat sweeper about 5 minutes after the seed ("Agent stopped responding"); earlier screens showed it as Agent working. Opening its failure item marked it read (5 → 4). WS-5/WS-7 PR fields "Unknown" (fake links).

### Landing after sign-in
| # | Sev | Finding |
|---|---|---|
| RA1 | S1 | Lands on `/` **Dashboard**: "4 spaces · 14 open tasks · 1 run in progress", space cards, Recent activity records, Agents panel. No task waiting on Jussi named; 4 unread Inbox items only as a badge. (`01`) |
| RA2 | S2 | Space cards miscount: Web shop "6 open · **0 failed** · 1 running" while WS-3 failed; Live Verification Project "Nothing needs attention · 0 open" while Pulse lists LVP-1 under Awaiting review. (`01`, `05`) |
| RA3 | S2 | Recent activity is records ("Run · Add order history export · web-shop • Planning • Completed", "Task · … · Medium"), no people; each task appears twice (Run row, Task row). Activity sentences not reused. (`01`) |
| RA4 | S3 (+) | Home checklist works: Invite ✓, Tracker ✓ struck through, Connect Slack open, dismissible. (`01`) |
| RA5 | S3 | Plumbing on the PM's home: Agents panel ("active" ×3), "Platform" nav heading. |

### Inbox
| # | Sev | Finding |
|---|---|---|
| RA6 | S1 | Needs you holds only 4 stale "Updates on tasks you follow": plan ready for WS-5 (already approved by Tomi), plan and research ready for WS-7 (done), research ready for WS-5 (he approved it). Items don't clear when what they announce is resolved. WS-1, WS-2 and PAY-1 say "YOUR MOVE" to him on their pages but aren't in his Inbox. (`02`, `10`, `13`, `19`) |
| RA7 | S2 | Only Snooze 1 day / Mark done, no primary action; item text opens the task but isn't styled as a link. (`02`) |
| RA8 | S2 | New mid-walkthrough under **Failures you own**: "A research run on 'Rewrite the order confirmation email' failed **because of setup**: Agent stopped responding". Jussi doesn't own WS-6 (Dev does); the task page frames it as an agent failure with Try again; no Fix link; opens the task, not the run. (`22`, `17`) |
| RA9 | S2 | My tasks groups correctly (Waiting on you: UW-6; Waiting on others: WS-5; Done: WS-7) but rows show only his relation ("you asked", "you own it, you review"), not state or who it waits on. (`03`) |
| RA10 | S3 | Done tab works; tab title "Viberglass". (`04`) |

### Pulse
| # | Sev | Finding |
|---|---|---|
| RA11 | S2 | Nav "Pulse", heading "Action Required". Not personal: 8 tasks from every space under Awaiting review, no keys, owners or reviewers; WS-3, WS-4, WS-5 absent. Overlaps Inbox, My tasks and space home. (`05`) |
| RA12 | S3 | "By Phase" Research/Planning/Execution vs stepper Research/Plan/Build; severity chips on every row. (`06`) |

### Navigation and sidebar
| # | Sev | Finding |
|---|---|---|
| RA13 | S2 | Sidebar swaps inside a space: Dashboard · Inbox · Pulse · Settings · Spaces → Home · Inbox · Space (Dashboard · Tasks · Settings) · Operations (Runs · Schedules). Pulse, workspace Settings, other spaces vanish; accent colour changes (yellow, purple, brown); two "Dashboard"s, two "Settings". Contradicts plan §6.1. (`07`, `20`) |
| RA14 | S3 | Sidebar space list cuts off after 3 spaces. (`01`) |
| RA15 | S3 | Breadcrumb shows slug. (`10`) |

### Space home
| # | Sev | Finding |
|---|---|---|
| RA16 | S1 | WS-5 (PR open) under **Not started** with "Execution" chip; WS-3 (failed) missing (sections: Agent working 1 · Awaiting review 2 · Not started 2 · Recently resolved 1). (`07`) |
| RA17 | S2 | Cards show UUID fragments, severity, phase, "Viberglass" source chip, "General" category; no owner or waiting-on. (`07`, `20`, `21`) |
| RA18 | S2 | Tiles contradict: Payments "Open Issues 0 · 0 in progress · 1 in review"; UX Walkthrough "Open Issues 2 · 4 in review" with 2 cards under Awaiting review. Old vocabulary ("Open Issues", "Auto-Fix Queue"). (`20`, `21`) |
| RA19 | S2 | "Active runs · 9" shows one card, titled with the repo URL, raw prompt as body. (`07`) |
| RA20 | S3 | Empty "Today's activity" chart saying "16 events today"; right column Agents, Severity, Workflow phase, Categories; nothing says Payments is private; a "Pending" chip overlaps a date. |

### Task board and table
| # | Sev | Finding |
|---|---|---|
| RA21 | S1 | WS-3 (failed) and WS-5 (PR open) read **Open**, like WS-4. Status filter has no Failed: Actionable · All · Open · Agent working · Awaiting review · Resolved. (`08`, `09`) |
| RA22 | S2 | Owner shown (good), but not whose move: WS-1 "Awaiting review" without Tomi. Only visible card action is **Archive**. (`08`) |
| RA23 | S3 | "Actionable" hides WS-7; table overflows; "Active Queue", "Planning", "Execution". (`09`) |

### Task page
| # | Sev | Finding |
|---|---|---|
| RA24 | S1 | "YOUR MOVE" on other people's moves: WS-1 "The plan is ready for your review · Approve plan" although Tomi is the named reviewer and Maria just pinged him; WS-2, PAY-1 likewise. Nowhere "Waiting on Tomi" (for the admin). Guess: the banner keys off the viewer being allowed to approve. (`10`, `13`, `19`) |
| RA25 | S2 | Stepper "Awaiting review"/"Approved" without who or when; only Activity names them. |
| RA26 | S2 | WS-2 banner says research is ready, but the Discussion ends with Maria's open question to Kaisa; nothing reflects that a person still has to answer. (`13`) |
| RA27 | S2 | Eyebrows vary: YOUR MOVE, NEXT STEP, THE RESEARCH FAILED, DONE; WS-4 "Next step" doesn't say it's Dev's. (`15`) |
| RA28 | S3 | Comment Activity entry quotes the highlighted text, not the comment; oldest first. (`11`) |
| RA29 | S3 | WS-5 banner: four equal-weight buttons; PR panel label overlap. (`16`) |
| RA30 | S3 (+) | Single banner, stepper, Document · Runs · Comments, rendered plan with highlights, Comments tab, People sidebar, History, "Write it yourself" on failed research, clear failure copy. |

### Settings
| # | Sev | Finding |
|---|---|---|
| RA31 | S2 | Web shop settings: "Failed to fetch space integrations", empty SCM dropdown, though runs clone fine; old copy ("bug tracking", "bug reports", `{{ clanker }}`, "agent runners"). Cause not investigated. (`24`) |
| RA32 | S3 | Workspace Settings opens on Members: invite with role description and spaces (Payments "(private)"); People table action column cut off. General/Advanced grouping clear. (`23`) |

### Status matrix
| Task | Dashboard feed | Inbox / My tasks | Pulse | Space home | Board / table | Banner | Stepper |
|---|---|---|---|---|---|---|---|
| WS-1 (plan, Tomi reviews) | Run · Planning · Completed | — | Awaiting review | Awaiting review | Awaiting review | YOUR MOVE · plan ready for your review | Plan · Awaiting review |
| WS-2 (research in review) | — | — | Awaiting review | Awaiting review | Awaiting review | YOUR MOVE · research ready for your review | Research · Awaiting review |
| WS-3 (failed) | — | — | — | missing | **Open** | THE RESEARCH FAILED | Research · Failed |
| WS-4 (not started) | Task · Medium | — | — | Not started | Open | NEXT STEP | Research · Not started |
| WS-5 (PR open) | Run · Planning · Completed | stale "…is ready" · Waiting on others | — | **Not started** | **Open** | YOUR MOVE · PR ready | Build · Pull request open |
| WS-6 (running → failed) | Run · Research · Running | Failures you own · "because of setup" | Agent working | Agent working | Agent working | THE RESEARCH FAILED · Agent stopped responding | Research · Failed |
| WS-7 (done) | Run · Planning · Completed | stale · Done | — | Recently resolved | hidden | DONE | Build · Done |
| PAY-1 | Run · Research · Completed | — | Awaiting review | Awaiting review | — | YOUR MOVE · research ready | Research · Awaiting review |

### Landing verdict
Dashboard of counts, cards and agents says nothing about what needs him, and some counts are wrong. The Inbox holds only stale updates; the tasks whose pages say "your move" never reach it, and WS-1 is really Tomi's. Only the task page tells the truth about state, and even it doesn't name who it waits on. Entering a space replaces the sidebar. My tasks is closest to a "what needs me now?" landing but is a tab away and shows no states.

---

## Returning-visit walkthrough: Maria PM (member, product leader)

Walkthrough performed 2026-10-01 on the dev stack as `maria.pm@example.com`: member, requester of WS-1, WS-2 and WS-4, member of Web shop, not of the private Payments space. Screenshots: `/tmp/ux/p25-maria-01…24-*.png`. Nothing approved, run, posted, snoozed or changed; no Inbox item opened (her 3 unread items are still unread).

Severity: **S1** blocks or misleads · **S2** major friction · **S3** polish.

Seed caveats: the WS-5 and WS-7 PR URLs were set in the database and don't exist on GitHub, so their PR panels say "Unknown". WS-6's run was ended as "Agent stopped responding" after 5 min 11 s (`-24`).

### Landing (sign-in → `/`)
| # | Sev | Finding |
|---|---|---|
| RM1 | S1 | Lands on the workspace Dashboard (counters, space cards, run/task feed, Agents panel). Nothing says WS-2 is waiting on her; only signal is the Inbox badge "3". (`-01`) |
| RM2 | S1 | The Agents panel ("Runs OpenCode with your OpenCode Go key", "opencode", "fake") links to runner detail pages: Docker image, sha256, deployment config, Secrets, and **Deactivate/Delete/Edit** buttons. Server refusal not tested. (`-23`) |
| RM3 | S2 | The Web shop card says "0 failed" although WS-3 failed; "13 open tasks" counts old test tasks; the card's primary button is **View runs**. |
| RM4 | S2 | Recent activity is run-centric ("web-shop • Planning • Completed"): slug instead of name, no actor. Task rows only "Web shop • Medium". |
| RM5 | S3 | The same `/` link is "Dashboard" in the main nav and "Home" inside a space, where "Dashboard" means the space home. |

### Inbox
| # | Sev | Finding |
|---|---|---|
| RM6 | S1 | WS-2's research is hers to approve (any participant; she's the requester). The Inbox shows it only under "Updates on tasks you follow", with no inline Approve. (`-02`) |
| RM7 | S2 | Stale items: "Research for gift note is ready" although she approved it herself; "Plan … is ready" although it waits on Tomi. All three look alike and offer only Snooze/Mark done, no primary action. |
| RM8 | S2 | Tomi's comment on her plan and Dev's reply to her @mention created no Inbox items. |
| RM9 | S1 | My tasks puts all three of her tasks, WS-2 included, under "Waiting on others". Rows say only "you asked": no state, no "waiting on whom". (`-03`) |
| RM10 | S3 | Done: "Nothing done yet." (correct). Positive: calm, task keys, plain sentences. (`-04`) |

### Pulse
| # | Sev | Finding |
|---|---|---|
| RM11 | S2 | Titled "Action Required" but a workspace-wide pipeline list: doesn't say whose action, mixes old test tasks, omits WS-3, WS-4 and WS-5, shows space slugs. (`-05`) |

### Navigation
| # | Sev | Finding |
|---|---|---|
| RM12 | S2 | The sidebar swaps inside a space ("Operations: Runs · Schedules" appears; Pulse and the space list disappear), against plan §6.1. (`-06`) |
| RM13 | S2 | Settings opens on API tokens/MCP. The profile chip goes to `/settings/members`: "You need an admin role to manage members." (`-20`, `-22`) |
| RM14 | S3 | "New space" is offered to a member (§4 matrix: admins and maintainers). Server answer not tested. |
| RM15 | S2 (partly positive) | Payments is hidden from every list. `/spaces/payments` directly shows an endless joke loader ("Teaching Eddie the shipboard computer some humility") instead of "Not found". (`-18`) |

### Space home
| # | Sev | Finding |
|---|---|---|
| RM16 | S1 | WS-5 (PR open) is under "Not started"; WS-3 (failed) is missing; cards show UUID fragments (`#229a`) instead of keys. (`-06`) |
| RM17 | S2 | Tracker/infra framing: Open Issues, Auto-Fix Queue, Severity breakdown (all "Medium"), Agents panel with Manage, "Active runs 9" showing the repo URL and the raw `<ticket><title>` prompt; empty activity chart despite 16 events; no person named anywhere. |
| RM18 | S3 | Every card has a "Viberglass" source chip, meaningless with one source. |

### Board and table
| # | Sev | Finding |
|---|---|---|
| RM19 | S1 | WS-3 (failed), WS-4 (not started) and WS-5 (PR open) all show **"Open"**: a failure is invisible. (`-07`, `-08`) |
| RM20 | S2 | Columns Research/Planning/Execution vs the stepper's Research/Plan/Build; "Awaiting review" doesn't say whose. Positive: cards show key and owner. |
| RM21 | S2 | Archive and "Start a run" on every card; Severity and Per page filters; WS-7 hidden by the "Actionable" default with no hint. |
| RM22 | S3 | The table overflows and cuts off Auto-Fix; no requester, reviewer or waiting-on columns. |

### Task pages
| # | Sev | Finding |
|---|---|---|
| RM23 | S1 | WS-1: "YOUR MOVE · The plan is ready for your review", then "Waiting on Tomi Laine to approve." (`-09`) |
| RM24 | S1 | WS-5: "YOUR MOVE · Review and merge it, then mark the task as done", to a PM who isn't owner or reviewer. Guess: the banner is chosen from task state, not from who is viewing. (`-15`) |
| RM25 | S2 | WS-3: "THE RESEARCH FAILED · Agent failed", Try again primary; no owner named, nothing on whether anyone was told. (`-13`) |
| RM26 | S2 | WS-6: primary button is a red **Cancel run**, shown to someone not on the task. Positive: the sandbox copy. (`-16`) |
| RM27 | S2 | WS-4: "NEXT STEP · Start the research", no owner named. Three labels for "someone should act": Your move, Next step, Agent working. (`-14`) |
| RM28 | S2 | A member not on the task can change the owner and add/remove reviewers. Default reviewer Tomi was added even to a research-only question task. |
| RM29 | S2 | WS-2 is a question, but the only way forward is "Approve & plan"; no "this answers it, close it". |
| RM30 | S3 | Breadcrumb shows the slug; Actions menu has Delete task for a member on someone else's task. |
| RM31 | S2 (mostly positive) | Activity is excellent: plain, attributed. Gaps: a comment entry quotes the anchored text, not the comment; oldest first; Discussion and Activity sit below long documents. (`-10`, `-12`) |
| RM32 | S3 | A comment can only be resolved; Maria can't reply to Tomi. (`-11`) |
| RM33 | S3 | WS-7: "DONE · This task is done", without who or when; the PR link overlaps the "Builds" label. (`-17`) |
| RM34 | S3 (positive) | The stepper agrees with the banner on every task. |

### Settings
| # | Sev | Finding |
|---|---|---|
| RM35 | S1 | Space Settings shows a read-only member the SCM fields, branch template placeholders, GITHUB_TOKEN and Auto-fix; also "Failed to fetch space integrations", and live-looking Save/Archive under the "you can't change these" note. (`-19`) |
| RM36 | S3 (positive) | Notifications settings are plain and correct. (`-21`) |
| RM37 | S2 | Runs page is a pipeline table (Repository, Duration; "Agent failed", "Agent stopped responding"), linked as the Dashboard's primary button. (`-24`) |

### Status matrix (as seen by Maria)
| Task [actual] | Inbox: Needs you | My tasks | Pulse | Dashboard | Space home | Board chip | Banner | Stepper |
|---|---|---|---|---|---|---|---|---|
| WS-1 [plan awaits Tomi] | "plan is ready" + "research is ready" (Updates) | Waiting on others | Awaiting review | Run "Planning • Completed" | Awaiting review | Awaiting review | YOUR MOVE … Waiting on Tomi | Plan · Awaiting review |
| WS-2 [awaits Maria] | "research is ready" (Updates) | Waiting on others | Awaiting review | — | Awaiting review | Awaiting review | YOUR MOVE · Approve & plan | Research · Awaiting review |
| WS-3 [failed] | — | — | — | "Web shop • Medium" (card: 0 failed) | missing | Open | THE RESEARCH FAILED | Research · Failed |
| WS-4 [not started] | — | Waiting on others | — | "Web shop • Medium" | Not started | Open | NEXT STEP | Research · Not started |
| WS-5 [PR open] | — | — | — | Run "Planning • Completed" | Not started | Open | YOUR MOVE · PR ready | Build · Pull request open |
| WS-6 [working → failed] | — | — | Agent working | Run "Running" | Agent working | Agent working | AGENT WORKING · Cancel run | Research · Agent working |
| WS-7 [done] | — | — | — | "Web shop • Medium" | Recently resolved | hidden (Resolved) | DONE | Build · Done |

### Landing verdict
She lands on an admin dashboard that doesn't answer "what needs me now?". The answer, "approve WS-2", exists only on the task page; the Inbox files it as an update and My tasks says it's waiting on others. The task page is the most trustworthy screen (stepper, Activity, Discussion), but its banner says "Your move" to whoever is viewing. Each list screen uses its own status words, and the failed task is hidden or mislabelled. Plumbing still reaches a member through the dashboard's agents panel, runner pages, space settings and Settings' API-tokens default.

---

## Returning-visit walkthrough: Dev Koskinen, member engineer (RD series)

2026-10-01, dev stack, as `dev.koskinen@acme-shop.example.com` (member; default owner of every Web shop task, maintainer of private Payments, requester of PAY-1, @mentioned on WS-2; 10 unread). Seeded minutes before, so times read "1–7m ago". Screenshots: `/tmp/ux/p25-dev-NN-*.png`. Opening the WS-3 failure item marked it read (10 → 9); nothing else changed. Seed artefacts: WS-5/WS-7 PRs don't exist ("Unknown"); WS-3's error is the fake agent's generic "Agent failed".

### Landing / workspace Dashboard
| # | Sev | Finding |
|---|---|---|
| RD1 | S1 | **Lands on `/` (Dashboard), not the Inbox**: counters ("4 spaces · 14 open tasks · 1 run in progress"), space cards, run/task feed, Agents list. Nothing names him or his 10 items except the nav badge. (`-01`) |
| RD2 | S1 | Web shop card says **"0 failed"** while WS-3 failed; "1 run in progress." with "View runs". |
| RD3 | S2 | "Recent activity" mixes runs and tasks ("Run · … · web-shop • Planning • Completed" / "Task · … · Web shop • Medium"): no actors, keys or next move; slug in one row type, name in the other. |
| RD4 | S2 | Agents list shown to a member ("Runs OpenCode with your OpenCode Go key", "Walkthrough agent · fake"), linking to runner pages (RD35). |
| RD5 | S3 | His own name links to `/settings/members`: "You need an admin role to manage members." No profile page. (`-20`) |
| RD6 | S3 | At 720 px height the sidebar's space list cuts off with no scroll cue. |

### Inbox: Needs you
| # | Sev | Finding |
|---|---|---|
| RD7 | S1 | PAY-1 and WS-2 are research for him to approve (task pages: "YOUR MOVE · Approve & plan"), but the Inbox has them only as "Updates on tasks you follow · The research for … is ready". Research never produces a review request. (`-02`) |
| RD8 | S2 | 8 updates for 7 tasks (one "research ready", one "plan ready" per task), all equal weight; updates on done WS-7 and long-approved WS-5 still offer Snooze/Mark done. Won't scale. |
| RD9 | S2 | The mention stays unread after he replied in the thread; no excerpt of the message. |
| RD10 | S2 | No inline primary action, only Snooze 1 day / Mark done. Positive: clicking a row opens the task by key and marks it read. (`-24`) |
| RD11 | S3 | Failure item "…failed: Agent failed" with no Fix or Try again on it. |
| RD12 | S3 | Page title "Viberglass"; Done tab "Nothing done yet." without saying what lands there. |
| RD13 | + | Grouping with counts, keys on every row, unread badge in nav. |

### Inbox: My tasks
| # | Sev | Finding |
|---|---|---|
| RD14 | S1 | "Waiting on you · 6" = WS-5 (PR open), WS-1 (waiting on Tomi), WS-3 (failed), PAY-1, WS-2, WS-4, every reason "you own it". Ownership is treated as having the move; WS-1 contradicts its task page. "Waiting on others" empty. (`-03`) |
| RD15 | S2 | Rows show no status, step or age. Agent working (WS-6) and Done (WS-7) correct. |

### Pulse
| # | Sev | Finding |
|---|---|---|
| RD16 | S2 | Nav "Pulse", page "Action Required". "Awaiting review · 8" mixes his tasks with old UX Walkthrough test tasks, names no reviewers, no keys; omits failed WS-3, not-started WS-4, PR-open WS-5. Not personal; no live sessions. (`-05`) |

### Navigation inside a space
| # | Sev | Finding |
|---|---|---|
| RD18 | S2 | Sidebar replaced: Home · Inbox · Space (Dashboard, Tasks, Settings) · Operations (Runs, Schedules). Pulse and other spaces vanish; "Dashboard" now means the space and "Home" means what was "Dashboard" outside; accent colour changes per space. (`-06`, `-18`) |
| RD19 | S3 | Breadcrumb shows slug. Private space only marked in its Members settings: no lock on sidebar, card or task. |

### Space home
| # | Sev | Finding |
|---|---|---|
| RD20 | S1 | WS-3 (failed) **missing** (sections cover 6 of 7); **WS-5 (PR open) under "Not started"** with an "Execution" chip. (`-06`) |
| RD21 | S2 | Cards show hash ids ("#229a"), "Viberglass" and "General" chips; no owner, reviewer or next move. |
| RD22 | S2 | Bug-tracker vocabulary: "Open Issues 3 · 1 in progress · 2 in review", "Auto-Fix Queue", Severity, Categories. Payments "Open Issues 0 · 1 in review" vs dashboard "1 open task". (`-18`) |
| RD23 | S2 | "Active runs 9" lists 1 running run, titled by repo URL, showing the raw prompt ("Create a research document for this ticket. <ticket><title>…"). "Today's activity" empty chart while saying "16 events today". |
| RD24 | S3 | Agents panel again on every space home. |

### Task board / table
| # | Sev | Finding |
|---|---|---|
| RD25 | S1 | "Open" = not started (WS-4), failed (WS-3), PR open (WS-5). "Awaiting review" for both WS-1 (Tomi's) and WS-2 (his). "Failed" never appears. (`-07`, `-08`) |
| RD26 | S3 | Positive: key and "Owner: Dev Koskinen" on every card. Gaps: no reviewer/waiting-on; "Archive" link on every card; "Active Queue", "Actionable" jargon; table overflows at 1280 px. |

### Task page
| # | Sev | Finding |
|---|---|---|
| RD27 | S1 | WS-1: "YOUR MOVE · The plan is ready for your review" above "Waiting on Tomi Laine to approve"; Dev gets a disabled "Ask to approve", "Request approval from…", "Ask for changes". (`-12`) |
| RD28 | S2 | WS-2, PAY-1: "YOUR MOVE · Approve & plan" to Dev (policy allows any participant). Presumably every participant sees the same banner (not checked), so it doesn't say who's expected to approve. |
| RD29 | S2 | WS-6 running: only button a red **Cancel run**; "Watch progress" a link; "fresh sandbox, a minute or two" still shown 4 minutes in. (`-11`) |
| RD30 | S2 | WS-3: "THE RESEARCH FAILED · Agent failed", Try again (good); run view "Agent working · failed here" with no error text. (`-09`, `-10`) |
| RD31 | S2 | WS-5: "YOUR MOVE · The pull request is ready for review" with 4 buttons; the only screen that says "Pull request open"; external-link icon overlaps "Builds". (`-14`) |
| RD32 | S3 | Banner labels vary: YOUR MOVE / NEXT STEP (whose?) / AGENT WORKING / THE RESEARCH FAILED / DONE; "This task is done" without who or when. |
| RD33 | + | People sidebar; the stepper's labels are the clearest status text in the app; plain Activity; mentions as chips. |
| RD34 | S3 | Guest default reviewer Tomi listed as reviewer even on research-step and failed tasks; Activity doesn't record Dev became owner by the space default. |

### Settings
| # | Sev | Finding |
|---|---|---|
| RD35 | S2 | Workspace Settings shows only Notifications and API tokens (right), but dashboard agent cards open "Agent runners › Walkthrough agent" with Deactivate, Delete, Edit, image and sha. Server refusal not tried. (`-21`) |
| RD36 | S2 | Web shop settings as plain member: good read-only note, then "Failed to fetch space integrations" and "No integrations linked – use Viberglass as ticketing system" though GitHub is linked; copy still says "bug tracking", "tickets". (`-22`) |
| RD37 | + | Payments → Members (maintainer): clear Private/default owner/default reviewer copy. Notifications plain. (`-23`) |

### Status matrix
| Key | Truth | Dashboard | Inbox Needs you | My tasks | Pulse | Space home | Board/table | Banner | Stepper |
|---|---|---|---|---|---|---|---|---|---|
| WS-1 | plan awaiting Tomi | feed "Planning • Completed" | Updates plan/research ready | Waiting on you · you own it | Awaiting review | Awaiting review | Awaiting review | YOUR MOVE … Waiting on Tomi | Plan · Awaiting review |
| WS-2 | research to approve | – | Mention + Updates | Waiting on you | Awaiting review | Awaiting review | Awaiting review | YOUR MOVE · research ready | Research · Awaiting review |
| WS-3 | research failed | card "0 failed" | Failures you own | Waiting on you | absent | **absent** | Open | THE RESEARCH FAILED | Research · Failed |
| WS-4 | not started | feed "Web shop • Medium" | – | Waiting on you | absent | Not started | Open | NEXT STEP · Start the research | Research · Not started |
| WS-5 | PR open | feed "Planning • Completed" | Updates | Waiting on you | absent | **Not started** | Open | YOUR MOVE · PR ready | Build · Pull request open |
| WS-6 | agent researching | "1 running" | – | Agent working | Agent working | Agent working | Agent working | AGENT WORKING | Research · Agent working |
| WS-7 | done | feed | Updates (still open) | Done | absent | Recently resolved | hidden (Actionable) | DONE | Build · Done |
| PAY-1 | research to approve | "1 open task" | Updates | Waiting on you · you own it, you asked | Awaiting review | Awaiting review ("Open Issues 0 · 1 in review") | – | YOUR MOVE · research ready | Research · Awaiting review |

### Landing verdict
Dashboard never mentions him and hides the failure he owns. The Inbox is closest but files his two real moves under Updates, keeps an answered mention and updates on finished tasks, and has no inline actions; My tasks treats owning as having the move. Suggested (guess): one "Needs you" list built from the task page's next-move logic, one status phrase and one action per task, with "waiting on Tomi" and "agent working" folded below.

---

## Returning-visit walkthrough: Tomi Laine, guest reviewer (RT series)

2026-10-01, dev stack, as `tomi.laine@acme-shop.example.com` (workspace guest; member of Web shop only, its default reviewer; approved WS-5 and WS-7's plans; commented on WS-1's plan, which waits on him). Screenshots `/tmp/ux/p25-tomi-*.png`. Opening the WS-1 review request marked it read (4 → 3). Start research dialog on WS-4 opened and cancelled (buttons disabled). Nothing approved, posted, run, snoozed or saved. WS-6 swept by the heartbeat after 5m 11s.

| # | Sev | Finding |
|---|---|---|
| RT1 | S1 | Lands on the workspace Dashboard (counters, "View runs", run activity); nothing about the plan waiting on him; only the Inbox badge. |
| RT2 | S2 | Refused reads look like an empty workspace with create buttons: "No agents yet" on the Dashboard. |
| RT5 | S3 | Avatar links to Members: "You need an admin role". |
| RT6 | S1 | Review requests stay in Needs you after he acted: WS-5 and WS-7 still open though he approved both plans and WS-7 is done. WS-1 produces two items (review request + mention) for one ask. |
| RT7 | S3 | The WS-1 mention stays unread after he opens the review request. |
| RT8 | S3 | No inline action (Snooze, Mark done only); the item text isn't styled as a link. |
| RT9 | + | From landing, WS-1's plan and Approve are 2 clicks away (Inbox → item); his comment 3. |
| RT12 | S3 | Pulse "Action Required": no keys or names; leaves out failures and PRs. |
| RT13 | S2 | Sidebar changes inside a space: Pulse and spaces list vanish, Operations (Runs, Schedules) appears. |
| RT15 | S3 | Slug breadcrumb; page titles "Viberglass". |
| RT16 | S1 | Space home: hash ids (`#1d91`); WS-5 (PR open) under "Not started"; WS-3 (failed) missing. |
| RT17/18 | S3 | Space home bug-tracker framing ("Open Issues", "Auto-Fix Queue", "Severity breakdown"); run card shows the raw prompt. |
| RT20 | S1 | Board/table: failed WS-3 and PR-open WS-5 both "Open"; My tasks marks every row "you review" with no state. |
| RT21 | S3 | Board cards offer a guest Archive, a checkbox and a run button. |
| RT22 | + | Task page: right banner for WS-1, clear stepper, rendered plan with his comment highlighted, People, plain Activity. |
| RT23 | S1 | Banner says "YOUR MOVE" for moves a guest can't make: Approve & plan (WS-2), Try again, Start research (dialog: "No agents are configured yet" + Configure Agents), Run the build again, Mark as done; never names Dev as the one expected to act. |
| RT24 | S1 | Actions menu offers a guest Edit details, Skip to the build, Mark as done, Delete task. **Verified afterwards:** a guest's `PUT /api/tasks/:id` and `DELETE /api/tasks/:id` both return 200 (throwaway task, hard-deleted). |
| RT25 | S3 | WS-1 offers Approve while his own comment is unanswered; comments can't be replied to. |
| RT26 | S3 | Activity quotes the text he commented on, not his comment. |
| RT27 | S3 | An expanded run shows Prompt and Raw log tabs to a guest. |
| RT28 | S3 | Done banner without who or when. |
| RT30 | S2 | `/settings/secrets` and `/settings/agents`: empty pages with create buttons plus a "Failed to load" toast, instead of "not available to guests". |
| RT31 | S2 | Space Settings shows repository and credential fields, fetch errors, Save and Archive. |
| RT32 | S2 | Schedules: "Create a task template first"; New space and Create task offered (server refuses or would refuse). |
| RT33 | S2 | Private Payments spins forever instead of "not found"; Settings opens on API tokens, which guests can't use. |
| RT34 | + | A task in a space he isn't in correctly says "Task not found" (no link back). |

### Status matrix
| Task | Inbox | My tasks | Pulse | Space home | Board/table | Banner · stepper |
|---|---|---|---|---|---|---|
| WS-1 | "plan … ready for your review" + mention | Waiting on you | Awaiting review | `#1d91` Awaiting review | Awaiting review | YOUR MOVE · plan ready · Plan Awaiting review |
| WS-2 | — | Waiting on you | Awaiting review | Awaiting review | Awaiting review | YOUR MOVE · research ready |
| WS-3 | — | Waiting on others | missing | missing | Open | THE RESEARCH FAILED · Agent failed |
| WS-4 | — | Waiting on others | — | Not started | Open | NEXT STEP · Start the research |
| WS-5 | stale review request | Waiting on others | — | Not started | Open | YOUR MOVE · PR ready · Pull request open |
| WS-6 | — | Agent working | Agent working | Agent working | Agent working | later THE RESEARCH FAILED · Agent stopped responding |
| WS-7 | stale review request | Done | — | Recently resolved | hidden (Actionable) | DONE |

### Landing verdict
Should land on the Inbox (or a "your move" list); approving should clear the matching review requests; the banner should name whose move it is; guests shouldn't be offered create, run, delete or plumbing actions.

---

## Returning-visit walkthrough: Eero Salo, workspace viewer (RV series)

2026-10-01, dev stack, as `eero.salo@acme-shop.example.com` (viewer, persona P6), 1280×720. Screenshots `/tmp/ux/p25-eero-01…30-*.png`. Refusals tested (archive WS-4, research run on WS-4, ask Kaisa to approve WS-1, create a task): all refused, nothing changed in the database (checked). No permission leak.

### Landing: Dashboard
| # | Sev | Finding |
|---|---|---|
| RV1 | S1 | Doesn't answer J13: Spaces 3 · Open tasks 13 · Runs in progress 1, cards, raw "Recent activity" ("Web shop • Medium"; runs by slug), Agents panel. Nothing on outcomes, stuck work or owners. (01) |
| RV2 | S1 | Counts contradict: Web shop "0 failed" (WS-3 failed); Live Verification Project "Nothing needs attention · 0 open" while Pulse lists its task; "13 open tasks" vs 6 + 3 + 0 on cards. (01, 04) |
| RV3 | S2 | "New space" and agent cards / "View all agents" (runner plumbing) shown to a viewer. |
| RV4 | S3 | Slugs on cards; sidebar "New space" and "Awaiting review" list clipped at 720 px. |

### Inbox
| # | Sev | Finding |
|---|---|---|
| RV5 | S2 | "You're all caught up." / My tasks "Tasks you ask for, own or review show up here." A viewer can't ask, own or review: empty for good. (02, 03) |
| RV6 | S3 | Tab title "Viberglass" on Inbox, Pulse, space and task pages. |

### Pulse
| # | Sev | Finding |
|---|---|---|
| RV7 | S2 | "Pulse" vs "Action Required"; Awaiting review (7), Agent working (1); WS-3, WS-4, WS-5 missing; no owner or waiting-on. (04) |
| RV8 | S2 | "By Phase" Research/Planning/Execution vs Research · Plan · Build; chips mix severity and status; slugs. (05) |

### Space home
| # | Sev | Finding |
|---|---|---|
| RV9 | S1 | WS-5 (PR open) under NOT STARTED with "Execution" chip; WS-3 in no group (6 of 7). (06) |
| RV10 | S2 | "Open Issues", "Auto-Fix Queue", Severity, Categories "General 7", "Agents · Manage", "Active runs 9" (1 running) showing repo URL and raw prompt. |
| RV11 | S2 | Hash ids instead of keys; no owner or waiting-on; "Viberglass" origin badge on every card. |
| RV12 | S2 | Sidebar swaps inside a space; Pulse, workspace Settings, spaces list vanish; "Home" and "Dashboard" side by side with the same icon; "Create task" offered to the viewer. |

### Board and table
| # | Sev | Finding |
|---|---|---|
| RV13 | S1 | WS-3 (failed) "Open"; WS-5 "Execution · Open"; WS-4 "Open". (07, 11) |
| RV14 | S2 | Checkbox, Archive, Start a run on every card, Create in header. Archive fires on one click without confirmation, then "Failed to archive tasks" (sticks across Board/Table). Start a run opens the full dialog, refused only on submit ("Viewers can see everything but can't make changes."). (08–10) |
| RV15 | S3 | + owner and key; "Actionable" hides WS-7; table overflows; "Active Queue" jargon. |

### Task pages
| # | Sev | Finding |
|---|---|---|
| RV16 | S1 | "YOUR MOVE" to a viewer on WS-1, WS-2, WS-5; body then names someone else ("Waiting on Tomi Laine to approve."). (12, 17, 21) |
| RV17 | S2 | All actions offered: "Request approval from…" (lists Eero himself and the guest), Ask for changes, Try again, Start research, Run the build again, Mark as done; Actions menu (Edit, Mark as done, Delete); document Edit; "Write it yourself"; Resolve. Empty Discussion says "Ask a question or bring someone in with @" though there's correctly no composer. (13, 14, 20) |
| RV18 | S2 | Failures don't name whose move: WS-3 "Agent failed", WS-6 "Agent stopped responding"; owner only in People. (18, 22) |
| RV19 | S2 | WS-4 "NEXT STEP · Start the research… for you to review" doesn't name Dev. (19) |
| RV20 | S3 | WS-7 "DONE" without who/when (Activity has it). (23) |
| RV21 | + | Activity reads well; People, stepper, rendered plan, quoted comments clear. (16) |
| RV22 | S3 | Slug breadcrumb; PR panel overlap; Details lead with Severity and Category. |

### Other screens
| # | Sev | Finding |
|---|---|---|
| RV23 | S2 | New task form fully fillable, refused on submit; bug-framed copy ("the issue", "the bug and how to reproduce it"). (24) |
| RV24 | S2 | Space Settings: read-only note, but editable fields, Save, Reset, Manage Links, Archive space; "Failed to fetch space integrations", empty SCM dropdown, `GITHUB_TOKEN`. (26) |
| RV25 | S2 | `/settings/agents/walkthrough-agent` (from the dashboard): "Agent runners", image digest, Deactivate/Delete/Edit, old dashed style. (29) |
| RV26 | S2 | Settings lands on API Tokens (MCP), which viewers can't use; his name links to "You need an admin role to manage members."; no profile. (27, 28) |
| RV27 | S3 | Space Runs readable but no keys, "Planning", overflows. (25) |
| RV28 | S3 | Payments hidden; `/spaces/payments` shows a joke loader ("Hitching a ride on a passing Vogon constructor fleet") indefinitely instead of "not found". (30) |

### Status matrix
| Task | Dashboard | Pulse | Space home | Board / table | Banner · stepper |
|---|---|---|---|---|---|
| WS-1 | "Web shop • Medium" | Awaiting review · Planning | AWAITING REVIEW | Awaiting review | YOUR MOVE … Waiting on Tomi · Plan Awaiting review |
| WS-2 | — | Awaiting review · Research | AWAITING REVIEW | Awaiting review | YOUR MOVE … "Waiting on Dev Koskinen, Tomi Laine, Maria PM or Kaisa Designer to approve." |
| WS-3 | card "0 failed" | — | no group | **Open** | THE RESEARCH FAILED · Failed |
| WS-4 | "Web shop • Medium" | — | NOT STARTED | Open | NEXT STEP · Not started |
| WS-5 | "Web shop • Medium" | — | **NOT STARTED** | **Open** · Execution | YOUR MOVE · PR ready · Pull request open |
| WS-6 | run Running | Agent working | AGENT WORKING | Agent working | later THE RESEARCH FAILED · Agent stopped responding |
| WS-7 | "Web shop • Medium" | — | RECENTLY RESOLVED | hidden | DONE · Done |

### Landing verdict
**No.** Counts plus a raw feed, with wrong counts; Pulse omits failed, not-started and PR-open work and names no owners; the space home misfiles tasks; owners and progress are only clear inside each task, where the banner says it's his move. Inbox and My tasks stay empty for this role. An observer needs one read-only view across spaces: done (with outcome), stuck (with the person), in progress. Meanwhile nearly every write action is offered and refused only after trying.
