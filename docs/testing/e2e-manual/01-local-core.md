# 01 · Local core

The product itself on a local instance, with real agents. Most tests run on **L-REV** (fixtures) or **L-NEW** (empty). Files spaces need object storage and the preview server, which only **L-DEV** has (MinIO on :9000, previews on http://127.0.0.1:8890). Real agent runs use z.ai GLM unless a test says otherwise.

## Contents

- [Accounts and people (AUTH)](#accounts-and-people-auth)
- [First-run setup (SETUP)](#first-run-setup-setup)
- [Spaces (SPACE)](#spaces-space)
- [Tasks and the agent conversation (TASK)](#tasks-and-the-agent-conversation-task)
- [Files spaces and artifacts (FILES)](#files-spaces-and-artifacts-files)
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
1. Settings → Members → Invite `tester1@example.com` as **Member** with Storefront ticked. Open "What each role can do" and check it reads sensibly.
2. Open the email in local mail; open the link in a private window; set name and password.
3. Open the same link again.
4. Create a second invite and **Revoke** it from Pending invites; open its link.

Expect: (1) "Emailed to …" and a copyable link. (2) The page says "<inviter> invited you as a member", then Home. (3) and (4) "This invite link has expired, was revoked or was already used. Ask for a new one."

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
1. Settings → API tokens → create "manual-test"; copy it (shown once).
2. `curl -H "Authorization: Bearer <token>" http://localhost:9088/api/auth/me`.
3. Revoke it; repeat the curl.

Expect: (2) Refused (API tokens are for MCP and the CLI, not session routes). The token's "last used" updates after MCP-01. (3) Revoked tokens fail everywhere.

## First-run setup (SETUP)

### SETUP-01 · Setup with a provider key
Needs: L-NEW after AUTH-01; an OpenCode Go key.
1. Model step: choose **OpenCode Go**, paste a wrong key → error from the provider check. Paste the real key → continue.
2. Continue through space backing (Git repository), space and agent (SETUP-03 covers the repository; FILES-02 covers Files).

Expect: the default agent runs OpenCode, is **Ready** under Settings → Agents, and the starter task gets an explanation of the codebase in the task's conversation, with no plan and no Build suggestion.

### SETUP-02 · Setup with a custom endpoint
Needs: L-NEW (fresh); z.ai key.
1. Model step → **Custom endpoint**. Base URL `https://api.z.ai/api/paas/v4`, API Chat Completions, paste the key, **Find models**, pick `glm-4.7-flash`, **Check and continue**.
2. Repeat on a fresh instance with a wrong model (`gpt-5`) first.

Expect: the endpoint is stored with its own key; the default agent runs OpenCode on it; (2) the error names the models the endpoint lists.

### SETUP-03 · Repository step
Needs: the GitHub test repo; a read/write and a read-only token.
1. At "Choose your space backing", leave Space backing on Git repository. Enter the repository URL and the read-only token.
2. Use the read/write token.

Expect: (1) refused because the token can't push. (2) accepted with the default branch detected; Space step pre-fills the name.

### SETUP-04 · Demo workspace
Needs: L-NEW at the model step.
1. **Explore a demo workspace**. Look at its tasks (plans, a PR) and try asking an agent there.
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
1. As Dev, Storefront → Space settings: change the name back and forth; set default reviewers and "Remind about unanswered questions after" on Task defaults.
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

Expect: mention highlighted; Quinn notified (Home, and a Slack DM if linked; mentions aren't emailed); acknowledging or replying clears it; task state unchanged.

### TASK-04 · Plan, comments, revision
Needs: TASK-01; a ready GLM runner (L-REV's anthropic/claude-code works).
1. **Write the plan**. Watch the line above the suggestions name the agent first.
2. When done: select a sentence → comment; select another → **Suggest a change** with new wording; apply the suggestion as Maria.
3. **Revise the plan with 1 comment**.

Expect: plan v1 appears, with what the agent found in the repository, and reviewers are asked to take a look; the applied suggestion creates a new version; the revision is a new version and addresses the comment; comment cards appear in the thread.

### TASK-05 · Versions and hand edits
Needs: TASK-04.
1. Edit the plan by hand and save.
2. In the thread, open Plan v1; **Compare with current**; **Open current**.

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
1. While it works, write a message and **Send now and interrupt**.
2. **Pause the agent**, post a message, then **Let it carry on**.
3. **Take over**: copy the checkout commands; push a commit to the branch (see CLI-01); **Hand back** with a note.

Expect: (1) the turn stops and a new one answers the message. (2) The message waits; carrying on resumes the stopped step once. (3) The card names the agent and step that will resume; the next turn reads your pushed commit.

### TASK-09 · Failures and recovery
Needs: L-REV.
1. Ask a runner with a bad key (codex runner, or edit a runner's key to a dummy secret).
2. As Maria, then as Alex, read the failure card.
3. Fix the key; as Alex use **Retry all paused runs** (paused card) or **Try again**.

Expect: setup failure ("Model key rejected") → paused; Maria is told an admin must fix the runner's setup; Alex gets a "Check <runner>'s model key" link to that runner; no pointless retry offered until fixed; retry runs once. For a failure Viberglass can't name, the first line of the agent's own error shows under the failure title.

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

### TASK-13 · A plan in parts
Needs: TASK-04 on a space whose repository a token can write (GH-02).
1. Edit the plan by hand into three sections headed `## Part 1: <title>`, `## Part 2: <title>` and `## Part 3: <title>`; save.
2. **Build part 1** (from the Parts outline above the plan, or the suggestion).
3. While part 1's pull request is open, look at what's offered for part 2.
4. Merge part 1's PR on GitHub and wait for it to be picked up (GH-05). **Build part 2**.

Expect: the outline reads "Built in 3 parts, one pull request each", each part with a badge (Not built, Building, PR open, Merged) and a link to its PR. (3) No new build of part 2 is offered while part 1's PR is open, only "Add to part 1's pull request". (4) Part 2 gets a PR of its own. The task stays open until every part is merged, done or skipped.

### TASK-14 · Leaving the order of parts
Needs: TASK-13's setup on a fresh task with a plan in four parts, nothing built.
1. **Build part 1**. While its PR is open, press **Add to part 1's pull request** on part 2.
2. On part 4's menu (…): **Mark done**, then **Not done after all**, then **Skip this part**.
3. Merge the PR. **Build part 3**, and cancel the run before it opens a PR.
4. On part 3's menu: **Discard this build**, confirm with **Discard build**.
5. On part 3's menu: **Mark done**.
6. On another task with a plan in parts, nothing built: press **Build it**, offered next to **Build part 1**.

Expect: (1) the thread says "Add part 2 to the open pull request"; the commits land in part 1's PR; the outline no longer says "one pull request each". (2) The activity says the part was marked done, then skipped. (3) Part 3 shows Stopped and "Build part 3 again" is offered. (4) The dialog explains that the next build starts over; part 3 is back to Not built. (5) With parts 1–2 merged, 3 done and 4 skipped, the task becomes Done. (6) One PR builds the whole plan.

### TASK-15 · Context and usage
Needs: finished turns from TASK-04 on a harness that reports usage (OpenCode or Claude Code on z.ai), and one that doesn't.
1. Read the small line at the bottom of each agent turn.
2. Open **Run details** on a turn.
3. Settings → Run records: open the same run.

Expect: (1) "fresh session" or "resumed session", then "Context N% full" when the harness reports its context size, otherwise "Nk tokens in context" ("under 1k tokens in context" below 1,000). On z.ai GLM, a resumed turn's count includes cached tokens, so it doesn't drop to a few hundred. (2) Model · duration · input tokens · output tokens · cached tokens, then the cost or "cost not reported". (3) The same numbers; "Not reported by the agent" where the harness gave none.

## Files spaces and artifacts (FILES)

A Files space has no repository: its tasks and people share a set of files, kept between runs in object storage, and agents produce versioned artifacts that preview in the app. Run on **L-DEV** unless a test says otherwise.

### FILES-01 · Create a Files space
Needs: L-DEV as an admin.
1. **New space**: pick Space backing **Files**, name it "QA files", create.
2. Open Space settings; then open `/spaces/<slug>/settings/repository` directly.
3. Look at the sidebar under the space.

Expect: (1) repository fields disappear once Files is picked; the description says the files persist between runs and are shared by all tasks. (2) General says "Space backing: Files. Backing cannot be changed after creation." and its readiness banner raises no File storage problem; there is no Repository tab, and the repository URL lands on General. (3) Files and Artifacts appear under the space.

### FILES-02 · Setup with Files, with and without storage
Needs: L-NEW after AUTH-01 (it has no object storage), then L-DEV with an empty database.
1. On L-NEW, run first-run setup: at "Choose your space backing" pick **Files**; continue through space, agent and "Try your first task".
2. Repeat on L-DEV.

Expect: no repository or token is asked for. (1) The space readiness shows "File storage is not configured. Ask an administrator to configure it." and asking the agent fails with "File storage isn't configured, so this space can't save the agent's files." (2) The starter task "Draft a one-page project brief" runs; BRIEF.md appears under Files.

### FILES-03 · Upload, edit and delete files
Needs: FILES-01; Taylor (viewer) as a member of the space.
1. Files → **Upload** a PDF and a Markdown file. **New text file** `notes/todo.md`, write a few lines, **Save**.
2. Try **New text file** at `.viberglass/x.md`.
3. Edit the uploaded Markdown file and save; download it; delete `notes/todo.md`.
4. Upload a file over 25 MiB.
5. As Taylor, open Files.

Expect: the header shows the file count, total size and when the files were saved; each change saves at once ("Uploaded …", "Saved …", "Deleted …"). (2) "That folder is kept for Viberglass." (4) "The file is larger than 25 MiB." (5) Taylor can list and download but sees no Upload, New text file, edit or delete.

### FILES-04 · Runs share the files
Needs: FILES-03; a ready runner on Docker.
1. Create a task and ask its agent, in the composer, to summarise the uploaded notes into SUMMARY.md.
2. In a second task in the same space, ask an agent to add a line to SUMMARY.md.
3. Open Files.

Expect: (1) the turn ends with "Saved files · 1 added · N files". (2) The second agent finds the first one's SUMMARY.md and the turn says "1 changed". (3) Files shows both changes. The task's Actions menu offers **Mark done** instead of Finish task.

### FILES-05 · One writer at a time
Needs: FILES-04.
1. Start long turns in both tasks at once.
2. While a run holds the space, edit a text file in Files and upload another file.
3. Press **Cancel change** on one of the waiting changes.

Expect: (1) the second turn says "Waiting for another run to save this space's files…" and starts once the first has saved. (2) Files says "A run is changing these files right now"; the changes are listed under "Changes waiting for a run" and are saved once the run has saved. (3) That change is dropped.

### FILES-06 · Conflicting edits
Needs: FILES-04.
1. Open SUMMARY.md in the editor. In a task, ask the agent to rewrite SUMMARY.md; wait for its turn to save.
2. Save your edit.
3. Repeat, but save your edit while the run is still working.

Expect: (2) "Someone changed this file since you opened it, so your save was refused." Your text is kept, with **Load their version**. (3) The save waits; once the run has saved, it fails and stays under "Changes waiting for a run" with **Download your version** and **Dismiss**.

### FILES-07 · Create and revise an artifact
Needs: FILES-01; a ready runner.
1. In a task, write in the composer "A three-slide HTML presentation about our onboarding, with arrow-key navigation" and press **Create artifact**.
2. In the thread's artifact card press **Preview**; click through the slides with the arrow keys; go full screen.
3. Write a change in the composer and press **Revise artifact**.
4. Space → Artifacts: open the artifact; switch between versions with the Version select; **Download**.
5. In another task, ask for a one-page Markdown brief with **Create artifact**.

Expect: (1) the turn is "asked for an artifact"; a card shows the title, "Version 1 · <format>", Preview and Download. (2) The presentation loads in a frame from http://127.0.0.1:8890; its scripts, keys and full screen work. (3) Version 2 of the same artifact, not a new artifact. (4) Artifacts lists both artifacts with their task; a multi-file version downloads as a zip. (5) Markdown renders in the app, not in a frame.

### FILES-08 · Previews are isolated
Needs: FILES-07.
1. Ask for a revision whose script reads `document.cookie` and `localStorage`, calls `fetch('http://localhost:8888/api/auth/me')` and an external URL, and writes the results on the slide.
2. Copy the preview frame's address; open it again after an hour.
3. Restart the L-DEV backend with `PREVIEW_PUBLIC_URL` empty; open the HTML artifact and the Markdown one.

Expect: (1) no cookies or storage, the API and the external URL are blocked; only the version's own files load. (2) The expired link is refused; opening the artifact from the app again works. (3) The HTML artifact says "Previews aren't set up on this installation." and offers Download; Markdown still renders.

### FILES-09 · Failures, cancelling and finishing
Needs: FILES-04.
1. Cancel a turn while the agent is writing files.
2. Ask for **Create artifact** with an instruction not to declare an artifact (no `.viberglass/artifacts.json`).
3. Create a schedule in the Files space (CLAW-01) whose instructions ask for a one-page Markdown report, kept as an artifact. Let it run once while a turn in a task holds the space, then once more.
4. **Mark done**, then **Reopen task**.

Expect: (1) the space is free for the next run within about a minute. Within that minute the cancelled turn shows "Saved the files as they were when the run stopped · …", or, if the worker couldn't save, "Nothing from this run was saved, so the space's files are as they were before it." The Files page matches what the turn says. (2) The turn fails with "No valid artifact"; its files are still saved. (3) The scheduled run says it's waiting for another run to save the space, and starts once the turn has saved. It works on the space's files, with no repository or pull request; its page under Runs shows "Saved files · …" and the report's artifact card. Artifacts lists the report without a task; the second run adds a new artifact rather than a version. (4) Done, then open again for another revision.

### FILES-10 · Retention
Needs: L-DEV with `ARTIFACT_KEEP_VERSIONS=2` and `SPACE_FILES_KEEP_SNAPSHOTS=3` on the backend.
1. Revise one artifact until it has four versions; wait for the retention sweep (every 10 minutes).
2. Open version 1 from the old thread card and from the Version select.

Expect: the two newest versions stay; older ones show "This version is no longer kept. Older versions are removed as new ones are made." with **See the current version**. The current files still restore on the next run.

### FILES-11 · Publish an artifact
Not available yet. Publishing to Notion or Google Docs is planned; mark `n/a`.

## Home and Overview (HOME)

### HOME-01 · Home
Needs: L-REV as Maria, Sam, Taylor.
1. Check Needs you, Your tasks, the All/Unread/Mine filters, **Ask for something** in a space.
2. As Taylor open `/`.

Expect: counts match the rows; Taylor is sent to Overview.

### HOME-02 · Overview
Needs: L-REV.
1. Compare the five totals with the groups, per space and for All spaces.

Expect: every visible task in exactly one group; private spaces only for their members.

## Agent runners (RUNNER)

### RUNNER-01 · Create, start, readiness, delete
Needs: L-REV as Alex.
1. Settings → Agents → **New agent**: agent OpenCode; under Model pick the provider OpenCode Go, then **Add a key** inline. Leave Advanced as it is. Create.
2. Start it; watch readiness (Not running → Ready). Deactivate; Start again.
3. Edit: swap the key to a deleted/dummy secret → **Needs a model key** / **Key rejected** after a run.
4. Delete the runner.

Expect: the key list only holds keys for the chosen provider ("No key from this provider yet. Add one to continue." when there are none); readiness and compute status shown separately; a runner without a usable key is never picked automatically and asking it by name is refused with a clear message.

### RUNNER-02 · Configuration files, instructions, variables
Needs: RUNNER-01.
1. Add AGENTS.md instructions (e.g. "Always end the plan with a 'Risks' section") and a harness config file (opencode.json).
2. Bind an extra variable (any secret) and one secret to two variables.
3. Ask for a plan.

Expect: the instruction shows up in the output; the config is used; saving succeeds with the shared secret.

### RUNNER-03 · Codex ChatGPT login (optional)
Needs: a ChatGPT account.
1. Codex runner with ChatGPT login → **Connect**; follow the device code.
2. Run a task; run another a day later.

Expect: login stored as a shared secret; refreshed tokens saved after runs; **Reconnect** when expired.

### RUNNER-04 · Published image or build from source
Needs: L-DEV or L-REV as Alex.
1. New agent → open "Advanced: compute, instructions, tools and extra variables". Under Compute, with Docker on this host, check the Image setting.
2. Create the runner with **Published image** and Container Image empty; start it.
3. Edit it to **Build from source**; start it again.

Expect: (1) **Published image** is selected by default. (2) The agent's published worker image is pulled on the first start, then Ready. (3) The form says the image is built from the agent's worker Dockerfile, which takes several minutes; it becomes Ready after the build.

## Tools, templates and admin pages (ADMIN)

### ADMIN-01 · MCP servers
1. Settings → MCP servers → add an HTTP MCP server (e.g. a public docs MCP) with a token secret if needed.
2. Attach it to a runner (Advanced → Tools); ask the agent to use it.

Expect: the agent lists or calls the tool; the run log shows it.

### ADMIN-02 · Skills
1. Settings → Skills → upload a folder with a `SKILL.md`.
2. Attach to a runner; ask for something the skill covers.

Expect: the worker installs the skill; the agent uses it.

### ADMIN-03 · Prompt templates
1. Settings → Prompt templates: change the workspace "Every turn" template; override it in Storefront → Space settings → Agent instructions.
2. Ask for a plan in Storefront and in another space.

Expect: each space uses its template.

### ADMIN-04 · Secrets
1. Create, rename, replace the value, delete a secret. Try deleting one a runner or endpoint uses.
2. Check the audit log and API responses for the value.

Expect: values never shown after saving; in-use deletion refused; storage location matches the defaults (database locally).

### ADMIN-05 · Run records and audit log
1. Settings → Run records: open a record; filter.
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
1. As Alex: Settings → Notifications → **Send test email**.
2. Trigger each kind: review requested, task assigned, mentioned, step completed, setup failure (to admins), agent failure (to owner), task done, question asked, question reminder.

Expect: the test email arrives (the button is only there for admins, and only when email is set up). Email goes out only for setup failures, task done, questions, question reminders and expiring credentials, one per event to the right people, with a working link. Mentions, reviews, assignments and agent failures are not emailed: they show on Home and as Slack DMs (SLACK-02). Step updates go to the task's Slack thread.

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
