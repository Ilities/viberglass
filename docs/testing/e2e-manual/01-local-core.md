# 01 · Local core

The product itself on a local instance, with real agents. Most tests run on **L-REV** (fixtures) or **L-NEW** (empty). Real agent runs use z.ai GLM unless a test says otherwise.

## Contents

- [Accounts and people (AUTH)](#accounts-and-people-auth)
- [First-run setup (SETUP)](#first-run-setup-setup)
- [Spaces (SPACE)](#spaces-space)
- [Tasks and the agent conversation (TASK)](#tasks-and-the-agent-conversation-task)
- [Home and Overview (HOME)](#home-and-overview-home)
- [Agent runners (RUNNER)](#agent-runners-runner)
- [Tools, templates and admin pages (ADMIN)](#tools-templates-and-admin-pages-admin)
- [Schedules (CLAW)](#schedules-claw)
- [Notifications (NOTIF)](#notifications-notif)
- [Resilience (RES)](#resilience-res)

## Accounts and people (AUTH)

### AUTH-01 · First admin registration
Needs: L-NEW (reset it first if used).
1. Open the app: you are sent to registration. Submit email `ops@acme.internal`, password `short`.
2. Fix the password to 8+ characters and submit.
3. Try `/register` again in a private window with another email.

Expect: (1) a field error under Password, focus on it, other fields kept. (2) Account created, you land in setup. (3) Refused: "Initial setup has already been completed".

### AUTH-02 · Sign in and out
Needs: L-REV.
1. Sign in as `alex.admin@example.com` with a wrong password, then the right one (`Review-local-2026!`).
2. Account menu → Sign out; press Back in the browser.

Expect: (1) "Invalid email or password", then Home. (2) Back shows the login page, not cached app data.

### AUTH-03 · Invite, accept, single use, revoke
Needs: L-REV as admin; local mail.
1. Workspace settings → Members → Invite `tester1@example.com` as **Member** with Storefront ticked. Open "What each role can do" and check it reads sensibly.
2. Open the email in local mail; open the link in a private window; set name and password.
3. Open the same link again.
4. Create a second invite and **Revoke** it from Pending invites; open its link.

Expect: (1) "Emailed to …" and a copyable link. (2) The page says "invited you as a member", then Home. (3) and (4) A clear "no longer valid" page.

### AUTH-04 · Roles, deactivation, reset links
Needs: AUTH-03.
1. Change tester1's role to **Viewer**; as tester1 reload a task: no composer, no create buttons.
2. Deactivate tester1 while they're signed in; as tester1 click anything.
3. Reactivate; as admin create a **reset link**; open it, set a new password, sign in.

Expect: (1) Read-only everywhere; the API refuses writes (try posting via an old tab: error). (2) Session ends at once. (3) Link works once; the old password no longer works.

### AUTH-05 · Forgot password
Needs: L-REV, signed out.
1. `/forgot-password` → submit a known email.

Expect: an accepted message; **no email is sent** (by design: resets are admin-issued). Record the copy shown.

### AUTH-06 · API tokens
Needs: L-REV as Maria (member).
1. Your settings → API tokens → create "manual-test"; copy it (shown once).
2. `curl -H "Authorization: Bearer <token>" http://localhost:9088/api/auth/me`.
3. Revoke it; repeat the curl.

Expect: (2) Refused (API tokens are for MCP and the CLI, not session routes). The token's "last used" updates after MCP-01. (3) Revoked tokens fail everywhere.

## First-run setup (SETUP)

### SETUP-01 · Setup with a provider key
Needs: L-NEW after AUTH-01; an OpenCode Go key.
1. Model step: choose **OpenCode Go**, paste a wrong key → error from the provider check. Paste the real key → continue.
2. Continue through repository, space and agent (SETUP-03 covers the repository).

Expect: the default agent runs OpenCode, is **Ready** under Agents & runners, and the first task produces research.

### SETUP-02 · Setup with a custom endpoint
Needs: L-NEW (fresh); z.ai key.
1. Model step → **Custom endpoint**. Base URL `https://api.z.ai/api/paas/v4`, API Chat Completions, paste the key, **Find models**, pick `glm-4.7-flash`, **Check and continue**.
2. Repeat on a fresh instance with a wrong model (`gpt-5`) first.

Expect: the endpoint is stored with its own key; the default agent runs OpenCode on it; (2) the error names the models the endpoint lists.

### SETUP-03 · Repository step
Needs: the GitHub test repo; a read/write and a read-only token.
1. Enter the repository URL and the read-only token.
2. Use the read/write token.

Expect: (1) refused because the token can't push. (2) accepted with the default branch detected; Space step pre-fills the name.

### SETUP-04 · Demo workspace
Needs: L-NEW at the model step.
1. **Explore a demo workspace**. Look at its tasks (research, plan, PR) and try asking an agent there.
2. Home → demo banner → **Remove demo**.

Expect: sample data clearly labelled; demo tasks don't run agents; removal deletes exactly the demo space and its sample agent.

## Spaces (SPACE)

### SPACE-01 · Create, privacy and visibility
Needs: L-REV as Alex, Maria, Quinn (guest), Taylor (viewer).
1. As Maria, **New space** "QA open". As Alex, create "QA private" and switch **Private space** on in its Members page.
2. Check what each person sees in the sidebar and Overview.
3. As Quinn open `/spaces/qa-private` directly.

Expect: members and viewers see open spaces; the private space is visible only to its members and admins; guests only see spaces they were added to; (3) a not-found page.

### SPACE-02 · Space settings and members
Needs: SPACE-01; Dev (maintainer of Storefront).
1. As Dev, Storefront → Space settings: change the name back and forth; set default reviewers and the question reminder hours on Members.
2. As Maria (not a maintainer) open Space settings.
3. Link a connection under Space settings → Connections and set it primary; unlink it.
4. As Alex, archive "QA open" (it disappears from lists; find it via archived), then delete it: the deletion summary lists what goes.

Expect: maintainers edit; Maria sees read-only "About"; archive keeps data; delete is admin-only and irreversible.

## Tasks and the agent conversation (TASK)

### TASK-01 · Create a task
Needs: L-REV as Maria.
1. Storefront → **Create task**: title, description, severity, a screenshot attachment.
2. Open it via its key URL `/spaces/storefront/tasks/STO-<n>`; open **Media**.

Expect: next key in sequence; Maria is requester and owner; default reviewers added and mentioned; attachment viewable.

### TASK-02 · People on a task
Needs: TASK-01.
1. Change owner to Dev; add Quinn as reviewer; Sam starts watching.
2. As Quinn (guest) open the task.

Expect: each change appears in the thread; Quinn can comment and ask the agent (guest on the task); Sam sees the task on Home.

### TASK-03 · Thread, mentions, acknowledging
Needs: TASK-02.
1. As Maria write "@Quinn can you check the wording?" picking Quinn with the keyboard.
2. As Quinn: Home → Needs you → **Acknowledge mention**.
3. As Quinn reply in the thread instead, on a second mention.

Expect: mention highlighted; Quinn notified (Home, email if configured); acknowledging or replying clears it; task state unchanged.

### TASK-04 · Research, comments, revision, plan
Needs: TASK-01; a ready GLM runner (L-REV's anthropic/claude-code works).
1. **Write the research**. Watch the line above the suggestions name the agent first.
2. When done: select a sentence → comment; select another → **Suggest a change** with new wording; apply the suggestion as Maria.
3. **Revise the research with 1 comment**.
4. **Write the plan**.

Expect: research v1 appears and reviewers are asked to look; suggestion applied creates a new version; the revision is v2 and addresses the comment; the plan takes the research into account; comment cards appear in the thread.

### TASK-05 · Versions and hand edits
Needs: TASK-04.
1. Edit the plan by hand and save.
2. In the thread, open Research v1; **Compare with current**; **Open current**.

Expect: the hand edit is attributed to you as a new version; v1 opens read-only, labelled older.

### TASK-06 · Ask for code
Needs: TASK-04 on a space whose repository a token can write (see GH-03); Maria may ask for code only as a task participant or with a maintainer.
1. **Build it**.

Expect: a code turn; changes pushed to the task branch; a pull request opens and shows in the Code tab. On a read-only repository (L-REV fixture) the run fails with **Couldn't push changes** (setup failure).

### TASK-07 · Agent questions
Needs: TASK-01; Claude Code GLM runner.
1. Ask: "@anthropic — claude-code — GLM review before writing anything, use ask_human to ask the owner which tone to use, with options Formal and Casual. Make it blocking."
2. Check Home for the owner; answer with one press on an option.
3. Repeat with "not blocking" and let it carry on; answer later.
4. Leave a blocking question unanswered past the space's reminder hours (set them low in SPACE-02).

Expect: (1) the question appears once in full, in the answer card, addressed to the owner; the agent waits. (2) Answering resumes the agent, which uses the answer. (3) The agent continues with a stated assumption. (4) A reminder arrives; later it escalates to the owner.

### TASK-08 · Steering
Needs: a running turn; Maria as owner.
1. While it works, write a message and **Interrupt with this**.
2. **Pause the agent**, post a message, then **Let it carry on**.
3. **Take over**: copy the checkout commands; push a commit to the branch (see CLI-01); **Hand back** with a note.

Expect: (1) the turn stops and a new one answers the message. (2) The message waits; carrying on resumes the stopped step once. (3) The card names the agent and step that will resume; the next turn reads your pushed commit.

### TASK-09 · Failures and recovery
Needs: L-REV.
1. Ask a runner with a bad key (codex runner, or edit a runner's key to a dummy secret).
2. As Maria, then as Alex, read the failure card.
3. Fix the key; as Alex use **Retry all paused runs** (paused card) or **Try again**.

Expect: setup failure → paused; Maria is told an admin must fix it; Alex gets a link to that runner and "What the agent reported"; no pointless retry offered until fixed; retry runs once.

### TASK-10 · Cancel and duplicates
Needs: a running turn.
1. **Cancel run** from the turn.
2. Double-click a suggestion quickly.

Expect: the worker container stops; the turn shows stopped and keeps partial work if any; (2) only one run starts.

### TASK-11 · Summaries and a second agent
Needs: a task with 3+ finished turns.
1. **Summarise so far**.
2. **Bring in another agent** → pick a different runner.

Expect: a pinned summary; the new agent starts fresh, reads the summary, and says so.

### TASK-12 · Finish, reopen, archive, delete
Needs: a disposable task.
1. Actions → **Finish task**; then **Reopen task**.
2. Archive it; find it under archived tasks; unarchive.
3. As Maria try to delete; as Alex delete.

Expect: finishing keeps history and merges nothing; only admins delete.

## Home and Overview (HOME)

### HOME-01 · Home
Needs: L-REV as Maria, Sam, Taylor.
1. Check Needs you, Your tasks, the All/Unread/Mine filters, **Ask for something in** a space.
2. As Taylor open `/`.

Expect: counts match the rows; Taylor is sent to Overview.

### HOME-02 · Overview
Needs: L-REV.
1. Compare the five totals with the groups, per space and for All spaces.

Expect: every visible task in exactly one group; private spaces only for their members.

## Agent runners (RUNNER)

### RUNNER-01 · Create, start, readiness, delete
Needs: L-REV as Alex.
1. **New agent runner**: OpenCode, provider OpenCode Go with an **Add a key** inline, default compute. Create.
2. Start it; watch readiness (Not running → Ready). Deactivate; Start again.
3. Edit: swap the key to a deleted/dummy secret → **Needs a model key** / key rejected after a run.
4. Delete the runner.

Expect: readiness and compute status shown separately; a runner without a usable key is never picked automatically and asking it by name is refused with a clear message.

### RUNNER-02 · Configuration files, instructions, variables
Needs: RUNNER-01.
1. Add AGENTS.md instructions (e.g. "Always end research with a 'Risks' section") and a harness config file (opencode.json).
2. Bind an extra variable (any secret) and one secret to two variables.
3. Run research.

Expect: the instruction shows up in the output; the config is used; saving succeeds with the shared secret.

### RUNNER-03 · Codex ChatGPT login (optional)
Needs: a ChatGPT account.
1. Codex runner with ChatGPT login → **Connect**; follow the device code.
2. Run a task; run another a day later.

Expect: login stored as a shared secret; refreshed tokens saved after runs; **Reconnect** when expired.

## Tools, templates and admin pages (ADMIN)

### ADMIN-01 · MCP servers
1. Workspace settings → MCP servers → add an HTTP MCP server (e.g. a public docs MCP) with a token secret if needed.
2. Attach it to a runner (Advanced → Tools); ask the agent to use it.

Expect: the agent lists or calls the tool; the run log shows it.

### ADMIN-02 · Skills
1. Workspace settings → Skills → upload a folder with a `SKILL.md`.
2. Attach to a runner; ask for something the skill covers.

Expect: the worker installs the skill; the agent uses it.

### ADMIN-03 · Prompt templates
1. Change the workspace research template; override it in Storefront → Space settings → Agent instructions.
2. Run research in Storefront and in another space.

Expect: each space uses its template.

### ADMIN-04 · Secrets
1. Create, rename, replace the value, delete a secret. Try deleting one a runner or endpoint uses.
2. Check the audit log and API responses for the value.

Expect: values never shown after saving; in-use deletion refused; storage location matches the defaults (database locally).

### ADMIN-05 · Run records and audit log
1. Workspace settings → Run records: open a record; filter.
2. Audit log: find the role change, secret changes, runner edits from earlier tests.

Expect: records show harness, model ("model not reported" when unknown), outcome; no secret values anywhere.

## Schedules (CLAW)

### CLAW-01 · Scheduled runs
Needs: L-REV as Maria in Storefront.
1. Storefront → Schedules → **Templates**: create a template ("Weekly dependency check").
2. **Schedules**: create one from it, every 5 minutes, with an outbound webhook URL (e.g. a https://webhook.site URL) and secret.
3. Wait for an execution; open it. **Pause**, wait past the next time, **Resume**.

Expect: executions at the schedule; webhook received with a signature; paused schedules don't run.

## Notifications (NOTIF)

### NOTIF-01 · Email notifications
Needs: L-REV with local mail.
1. Your settings → Notifications → **Send a test email**.
2. Trigger each kind: review requested, task assigned, mentioned, step completed, setup failure (to admins), agent failure (to owner), task done, question asked, question reminder.

Expect: one email per event to the right people, with a working link.

### NOTIF-02 · Credential expiry warning
1. Give a connection credential an expiry within 7 days (Connections → credential).
2. Wait for the 6-hourly sweep (or restart the backend).

Expect: admins warned; the space readiness banner shows the warning.

## Resilience (RES)

### RES-01 · Worker dies mid-run
1. Start a turn; `docker kill` its worker container.

Expect: within ~5 minutes the heartbeat sweeper fails the run as **Agent stopped responding**; Try again works.

### RES-02 · Backend restart mid-run
1. Start a turn; restart the backend while it runs.

Expect: the run finishes and its result is recorded after the backend is back.

### RES-03 · Database late or down
1. Stop Postgres, start the backend, start Postgres a minute later.

Expect: the backend waits and comes up; no crash loop.
