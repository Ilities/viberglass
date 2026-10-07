# Manual testing of the v1 review fixes

A step-by-step pass over the 26 backlog items on real instances, with a real model behind the agents. Each step says what to do and what you should see; the UX number ties it to [BACKLOG.md](BACKLOG.md). Work top to bottom: later steps reuse what earlier ones create.

## Contents

- [Before you start](#before-you-start)
- [A. First run on the empty instance](#a-first-run-on-the-empty-instance)
- [B. Admin on the review instance](#b-admin-on-the-review-instance)
- [C. Live agent runs](#c-live-agent-runs)
- [D. Reviewer and PM collaboration](#d-reviewer-and-pm-collaboration)
- [E. Watcher and viewer](#e-watcher-and-viewer)
- [F. Phone, keyboard and themes](#f-phone-keyboard-and-themes)
- [Resetting](#resetting)

## Before you start

| Instance | App | Use it for |
|---|---|---|
| Review (fixtures from the review) | http://localhost:3200 | Everything except first-run setup |
| Empty (no users yet) | http://localhost:3201 | Registration and first-run setup, including custom endpoints |
| Local mail (both) | http://localhost:8125 | Invites and notification emails |

- Review accounts all use the password `Review-local-2026!`: `alex.admin@example.com` (admin), `pm.review@example.com` (Maria, PM), `engineer.review@example.com` (Dev, Storefront maintainer), `reviewer.review@example.com` (Quinn, guest reviewer), `watcher.review@example.com` (Sam), `viewer.review@example.com` (Taylor, viewer).
- Use a separate browser profile, or a private window, per person, so you can switch without logging out.
- Agents run in Docker on `viberglass-ux-review-worker:local` (review) and `uxfresh/viberator-worker-*` (empty instance); both images were rebuilt from the current code on 2026-10-05.
- Real runs use the z.ai GLM key in the gitignored `.zai-token` (GLM 4.7 Flash; a run costs very little). The review database already holds it encrypted. Revoke the key when testing is over.
- Status of the instances: `python3 docs/ux/v1-review/harness/instance.py status` (review) and `python3 .tmp/ux-fresh/instance.py status` (empty).

## A. First run on the empty instance

Open http://localhost:3201.

1. **Registration errors (UX-25).** Register the first admin with name `Alex`, email `alex@acme.internal` and password `short`. Expect "Use at least 8 characters." under the password field, focus moved there, and name and email still filled in. Change the password to 8+ characters and submit: the account is created. The `.internal` address is accepted.
2. **Custom endpoint in setup (UX-05).** On "Connect an AI model", open the provider list and pick **Custom endpoint (z.ai, a self-hosted model, …)**.
   - Base URL `https://api.z.ai/api/paas/v4`; API **OpenAI-compatible Chat Completions**. The hint says agents run it on **OpenCode**. Switch the API to **Anthropic Messages**: the hint says **Pi**. Switch back.
   - Paste the z.ai key, press **Find models**: the model field fills in (glm-4.7-flash or similar) and the endpoint's model count shows.
   - Type `gpt-5` as the model and press **Check and continue**: an error says the endpoint doesn't list it and names models it does. Put `glm-4.7-flash` back and continue.
3. **Repository and space.** These steps need a GitHub repository and a token that can push and open pull requests. If you have one, finish setup: the space is created and "Preparing your agent…" turns into the first-task step. If not, use **Skip setup** and continue with step 5.
4. **First task (UX-05).** Ask the first task for research. It runs on OpenCode against z.ai and writes a Research v1.
5. **Runner details (UX-03, UX-05, UX-24).** Workspace settings → Agents & runners. With setup finished, **Default agent** runs OpenCode on api.z.ai and reads **Ready**. Its page shows the custom endpoint and the requested model. Its Created and Updated times are in order.
6. **Endpoint compatibility in the runner form (UX-05).** New agent runner → agent **Claude Code**: the Provider field says Claude Code can't run on a custom endpoint, and the list offers no endpoints. Switch to **OpenCode** and then **Pi**: the api.z.ai endpoint is offered. Cancel.
7. **Secrets.** Workspace settings → Secrets: the key is stored as `api.z.ai key`, not under any vendor.

## B. Admin on the review instance

Log in at http://localhost:3200 as **Alex**.

1. **Naming (UX-17).** The sidebar shows **Workspace settings**; inside Storefront there is **Space settings**. Workspace settings → **Connections** is titled Connections.
2. **Connections and demo (UX-23).** Connections is grouped as In use / Available / "Not available yet" (folded), with no count tiles. On Home the demo banner has **Hide**; press it, reload: gone from Home. Open Demo: Acme storefront: the banner is still there and says its tasks don't run agents.
3. **Runner readiness (UX-03, UX-15).** Agents & runners: Google, Mistral and the demo agent read **Needs a model key** with a sentence why; the rest read **Ready**; compute status is a separate small line. Open **New agent runner**: name, agent and model come first, and compute, instructions, tools and variables are folded under Advanced with a summary ("Runs on Docker on this host · …"). Cancel.
4. **One secret, two variables (UX-06).** Edit any OpenCode review runner → Advanced → Extra environment variables: bind **z.ai GLM review key** to a new variable such as `EXTRA_GLM_KEY` (the same secret as its model key) and Save. It saves.
5. **Timestamps (UX-24).** On that runner's page, Updated is now later than Created. Rows written before the fix may still be off by your UTC offset.
6. **Roles (UX-22).** Workspace settings → Members → Invite someone: open **What each role can do**. Invite `newguest@example.com` as Guest to Storefront; the email arrives in local mail. Its link shows "invited you as a guest."
7. **Space settings (UX-16).** Storefront → Space settings: name and access first, then Repository with examples, then Issue tracker; open **Advanced**: the branch-name example reads like `viberglass/STO-12`. Clear the repository address and **Save changes**: the error says what to enter. Use **Reset**.
8. **Overview (UX-08).** Overview: the five totals add up to the tasks listed, and no task appears in two groups.

## C. Live agent runs

Still as **Alex** in Storefront. These steps call the model.

1. **Choosing who runs it (UX-04, UX-10).** **Create task** "Manual check: codex auth" with any short description. In the composer, type `@open`, press ArrowDown until **openai — codex — GLM review** is highlighted and press Enter: the mention is inserted without a newline. Add "please look at greeting.js" and **Post**. A mention starts a reply turn with that agent; the line above the suggestions now names it as the agent on this task.
2. **Rejected key (UX-07, UX-03).** The Codex turn fails. Expect a failure card naming **openai — codex — GLM review**, titled **Model key rejected**, a button to check that runner's model key (it opens the runner's page), and **What the agent reported** showing "Authentication required". No "Try again" suggestion is offered, and a paused card explains it waits for the fix. On Agents & runners the Codex runner now reads **Key rejected**; saving the runner unchanged clears it back to Ready.
3. **A second paused agent (UX-26).** On the same task, use **Bring in another agent** → **deepseek — opencode — GLM review**. While it is working, press **Pause the agent**. The task now has two paused agents.
4. **Hand back resumes one (UX-26).** Choose **Take over**. The card says "Carrying on resumes deepseek — opencode — GLM review only, and …" followed by the step it will ask for again (a reply here, since bringing an agent in is a reply turn). Write a note and **Hand back**. Exactly one new turn starts, on deepseek; Codex stays quiet. The Runs tab count goes up by one.
5. **Research without a document (UX-01).** **Create task** "Manual check: pi research". Mention **custom-glm — pi — GLM review** with a short hello, so Pi becomes the agent on the task. When that turn ends, the line above the suggestions names Pi; press the **Write the research** suggestion. If Pi again returns nothing, the turn shows as failed with **No document written** ("The agent finished without writing the research"); if it does write, a Research v1 appears. Either way, a completed research turn never leaves an empty Research tab.
6. **Turn summaries (UX-21).** Look at any finished turn: one sentence of intent, a result line such as "Wrote the research.", and **Show what it said** for the full reply. On Home, the task row ends with that sentence or "Stopped: Model key rejected."

## D. Reviewer and PM collaboration

Use **Quinn** (guest reviewer) and **Maria** (PM) side by side on **STO-7**.

1. **Who the agent is (UX-04).** As Quinn, open STO-7. Above the suggestions: "Asks go to deepseek — opencode — GLM review, already on this task." A guest sees the name even though they can't see runner settings. The first suggestion is **Try again with alibaba — qwen-cli — GLM review**.
2. **Versions (UX-02).** In the thread, press **Open** on Research v1: the pane shows v1, labelled "Older · current is v2", with **Compare with current**; press it to see the changed lines. **Open current** returns to the editable document. Open on Research v2 opens the current document directly.
3. **Tabs (UX-11, UX-14).** The artifact tabs read Research / Plan / Code with a status each and no numbers. Tab to them and use the arrow keys: focus and selection move together.
4. **Comment in the thread (UX-13).** On the current research, select a sentence → comment "Please cover the exact string in a test." The thread shows a card with Quinn's comment, a short quote, **Open** and **Open in comments**. As Maria, resolve it in the Comments tab: the card turns **Resolved**.
5. **Mention and acknowledge (UX-10, UX-12).** As Quinn, write "@Mar", pick Maria with the keyboard, add a short question and post. As Maria, Home → **Needs you** shows it; press **Acknowledge mention**: it leaves Needs you and the task's state is unchanged. The sidebar Home badge drops by one.
6. **A question for someone else (UX-21).** As Maria, post: "@anthropic — claude-code — GLM review before writing the plan, use ask_human to ask Maria whether the greeting should end with an exclamation mark. Make it blocking." When the question arrives, the thread shows one line pointing below, and the answer card says it's for Maria and that anyone on the task can answer. As Quinn, answer it: the thread reads "Quinn answered for Maria: …".
7. **Finishing (UX-12).** On a disposable task, Actions → **Finish task**: the confirmation says history stays and nothing is merged. **Reopen task** brings it back.
8. **Space filters (UX-20).** In Storefront, set State and, under **More filters**, an Owner: each shows as a chip; remove one with its ×, then **Clear all**. On a task, the details fold into one "Task details · …" line while people stay visible.

## E. Watcher and viewer

1. **Watcher (UX-22).** As **Sam**, open STO-7: open "What owner, reviewer and watcher mean". Use **Stop watching** and **Watch** again.
2. **Viewer (UX-18).** As **Taylor**: you land on Overview. Open a task with no plan (any compatibility task): the empty Plan tab says people on the task can ask the agent for it, with no "ask" or "write" instruction, and there's no "Ask for any of these" hint under the tabs. Your settings → Notifications points to Overview, not Home.

## F. Phone, keyboard and themes

1. **Phone (UX-09).** In browser dev tools, emulate a 390 × 844 phone and open STO-7 as Maria: **Conversation / Artifacts** buttons, details folded, the conversation first. Type a few words in the composer, switch to Artifacts and back: the text is still there. **Write a reply** scrolls to the composer and focuses it. Nothing scrolls sideways.
2. **Keyboard.** Without a mouse, go from the sidebar to a task, through the tabs, into the composer, pick a mention and post.
3. **Themes (UX-19).** Account menu → switch to dark and back. Surfaces are neutral; amber marks primary buttons, links and "Your move". Secondary text stays readable in both.

## Resetting

- The review instance keeps what you do; its fixtures are disposable.
- Start the empty instance over (stop it first):

```bash
python3 .tmp/ux-fresh/instance.py stop
docker exec viberglass-ux-review-postgres dropdb -U uxreview viberglass-ux-fresh
docker exec viberglass-ux-review-postgres createdb -U uxreview viberglass-ux-fresh
# then run the migrator with the backend environment from .tmp/ux-fresh/process-config.json, and:
python3 .tmp/ux-fresh/instance.py restart
```

- Stop everything when done: `python3 .tmp/ux-fresh/instance.py stop`, `python3 docs/ux/v1-review/harness/instance.py stop`, then `docker stop viberglass-ux-review-postgres viberglass-ux-review-mail`.
