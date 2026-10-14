# Demo videos

A prioritised list of short videos, each showing one journey from [User journeys](user-journeys.md), and a script for a two to three minute overview. Each video lists its seed data and what must be on screen at the end.

## Contents

- [Recording ground rules](#recording-ground-rules)
- [Shared seed workspace](#shared-seed-workspace)
- [The videos](#the-videos)
- [Overview video (2 to 3 minutes)](#overview-video-2-to-3-minutes)
- [Sources](#sources)

## Recording ground rules

- Agent turns take from under a minute to several minutes. Record the click, cut, and resume on the result. Show a "Working on it…" frame for a beat so the cut is honest. Never speed up the result itself into something it isn't.
- A merge on GitHub closes the task within about an hour, because Viberglass checks pull requests on a timer. Merge ahead of time and film the finished state, or cut with a caption ("later that hour").
- Prepare every task to the state the video starts from, with real agent runs, the day before. Keep a fallback copy of each task in that state (Actions → Copy to another space, or a second task) in case a retake needs a fresh one.
- Never show a key, token or webhook secret. Paste keys off screen, or blur the field.
- Use one theme throughout (light reads better in compressed video), a 1440×900 or 1600×1000 browser window, and the browser zoomed to 110 to 125 percent so labels are readable.
- Use the real app wording in captions and voice-over: space, task, plan, artifact, agent, Build it.
- The demo repositories are public. Pull requests the agent opens there are public too. Use forks under a demo organisation if that matters, and close or merge demo pull requests afterwards.
- Model keys: use the GLM coding plan (z.ai), OpenCode Go or free tiers, with a key made for the recording session and deleted afterwards.

## Shared seed workspace

One installation, on a public HTTPS address (Slack and the trackers need to reach it), with a preview hostname and an S3-compatible bucket so Files spaces and previews work. The one-server compose install fits.

People (each with their own browser profile, so switching is a click, not a sign-out):

| Name | Workspace role | Place in the story |
|---|---|---|
| Maria Lind | Member | Product lead; owns most tasks |
| Tomi Virtanen | Member, maintainer of both Git spaces | Engineer; reviewer |
| Quinn Okafor | Guest, invited to token.observer only | Designer; reviewer |
| Pat Reyes | No account; a Jira or GitHub user only | Support lead who lives in the tracker |
| Sam Iqbal | Viewer | Stakeholder who watches Overview |
| Admin | Admin | Sets things up; appears only in admin videos |

Everyone except Pat and the admin links Slack under Settings → Notifications.

Agents (Settings → Agents):

- "Claude Code · GLM" on z.ai's Anthropic endpoint (a connected model), the workspace default.
- "OpenCode · OpenCode Go" with an OpenCode Go key.
- "OpenCode · Qwen on Verda", using a deployed model (only for video 6; deploy and wake it before recording, then put it back to Scale to zero or delete it afterwards).
- Optionally "OpenCode · OVH AI Endpoints" as a connected model in France, if its free tier isn't rate-limited that day.

Spaces:

| Space | Backing | Repository | Settings |
|---|---|---|---|
| token.observer | Git repository | github.com/Ilities/token.observer (a React and Vite site about LLM inference costs) | Members Maria, Tomi, Quinn (guest). Default reviewer Tomi. Incoming issues from GitHub: Matching labels `agent`, Automatically write a plan on |
| local-ctx | Git repository | github.com/Ilities/local-ctx (a TypeScript MCP helper that exposes stdio servers over HTTP with OAuth) | Members Maria, Tomi. Maintainer Tomi |
| Launch materials | Files | none | Members Maria, Tomi. Uploaded: `notes/launch-notes.md` (the launch's key messages and three customer quotes) and a logo PNG |
| Platform (private) | Git repository | local-ctx again, or any internal repository | Private space, members Tomi and the admin only. Used in the overview video's roles shot, to show it's in Tomi's sidebar and not in Quinn's |

Connections: GitHub (from setup, plus its webhook with Issues and Issue comments ticked, and Issues closed and reopened if the issue-closing behaviour is shown), Slack app installed and Bot active, optionally Jira for a Jira variant of video 4.

Background tasks, so Home, Overview and the space board look lived in (create them with real runs, in a mix of states):

- token.observer: "Add a methodology note under the crossover chart" (done, merged), "Fix the chart legend overlapping on mobile" (pull request open), "Compare per-second GPU pricing for H100 and L40S" (plan written, waiting on Maria), "Add MiniMax M2.7 to the model viability tracker" (not started).
- local-ctx: "Document the environment variables in the README" (done), "Return a clear error when a child command fails to start" (agent working, if one can be timed for recording).

## The videos

In priority order. The first three are the launch set; make those before anything else.

### 1. From an idea to a pull request, without opening an editor

Length: 75 to 90 s. Persona: product leader (Maria). Journey: 2, with a glimpse of 5.

Seed: task not yet created. Before recording, run the same request once to learn how long the plan takes and whether the agent asks a question; if it doesn't ask naturally, add to the description "Ask me which currencies to include before you plan."

Script:

1. Maria's Home. Needs you shows one row. Cursor to Ask for something; pick token.observer.
2. New task. Title: "Show prices in EUR as well as USD". Description: "Readers in Europe want to see euro prices next to the dollar ones on the cost comparison. Use a fixed rate we can update in one place. Done when every price on the comparison shows both." Choose Create task.
3. The task page. Pan across: Description, People with Maria as Owner and Tomi as reviewer, the Plan and Code tabs. Point at the line naming the agent for the next ask.
4. Choose Write the plan. The thread shows the agent's first line ("Planning: …"). Cut.
5. The agent's question card: "It's for you." Options shown as buttons. Maria writes "EUR only for now, rounded to cents" and chooses Answer. Cut.
6. "Wrote the plan". Open the Plan tab: scroll slowly over the opening section on what the agent found (the files that render prices; the heading is the agent's own), then the proposed change and the steps.
7. Choose Build it. Cut.
8. The Code tab: Pull request, State Open, Branch, Changes, Commits, and the preview link if the repository has one. Click through to the pull request on GitHub for one second, back to Viberglass.

End frame: the task page with the thread showing the question and answer, "Wrote the plan", the build turn, and the Code tab with the open pull request. Caption: "From a sentence to a pull request. No editor, no terminal."

### 2. Review the agent's plan like a colleague's doc

Length: 60 to 75 s. Persona: Tomi and Quinn reviewing, Maria as owner. Journey: 3.

Seed: the token.observer task "Compare per-second GPU pricing for H100 and L40S" with a written plan (v1), Tomi and Quinn on it as reviewers. Nothing else commented yet.

Script:

1. Tomi's Home: Needs you shows "Your move" on the task. Open it.
2. Plan tab. Select the sentence about the data source, choose Comment, write "Use the provider's published EUR prices and say when they were fetched", Add comment.
3. Switch to Quinn's browser (the guest). Select the heading text for the new chart, choose Suggest a change, type the new heading. Add comment.
4. The thread shows both comments with their quotes and Open in comments.
5. Maria's browser: the suggested action now reads "Revise the plan with 2 comments". Choose it. The agent's first line says how it read them. Cut.
6. Plan v2 arrives. Open the older version: "Older · current is v2". Choose Compare with current: the changes highlighted and struck through, word by word.
7. Back on the current plan, comments resolved.

End frame: the version comparison side by side with the thread showing two comments, the revise turn and "Wrote the plan". Caption: "Your whole team reviews the plan. The agent takes in every comment."

### 3. The agent asks the right person, wherever they are

Length: 45 to 60 s. Persona: Maria answering in Slack, Quinn answering in the app. Journey: 5 and 9.

Seed: a token.observer task "Add a dark theme toggle to the header" started from Slack with `/viberglass`, so it has a Slack thread. Its description asks the agent to check with Quinn about the toggle's placement. Time the question to arrive during recording, or pre-run it and film from the question onward.

Script:

1. Slack, a #product channel. Show the bot's post with the task and Open it in Viberglass, and the thread: "The agent is writing the plan…".
2. The agent's question appears in the Slack thread, addressed to Quinn, with option buttons ("Header right", "Settings menu").
3. Cut to Viberglass, Quinn's Home: "Agent asked you". Open the task: the question card says "It's for you." Quinn picks "Header right". Answer.
4. Back in Slack: the answer appears in the thread, then the plan attached as `plan.md` with a Build it button.
5. Maria presses Build it in Slack. The thread shows the run starting; cut; the pull request's link.

End frame: the Slack thread from top to bottom: task post, question, answer, `plan.md`, Build it, pull request link. Caption: "It asks instead of guessing, and the answer can come from anywhere."

### 4. Your issue tracker, worked on

Length: 75 to 90 s. Persona: Pat (support, lives in GitHub Issues or Jira) and Maria. Journey: 6.

Seed: GitHub webhook connected; token.observer's Incoming issues set to Matching labels `agent` with Automatically write a plan on. Pat's GitHub account (or a second test account) can open issues on the repository. For the Jira variant: a Jira Cloud site, the connection with its bot account, and the space taking label `agent`.

Script:

1. GitHub, as Pat: New issue on token.observer, "The cost table's per-token column is cut off on small screens", with label `agent`. Submit.
2. Viberglass, Maria's space board: the new task appears with the issue's key; open it. The thread shows the issue's text and the agent already planning. Cut.
3. Back to the GitHub issue: a comment from the bot with the plan's first paragraph and a link, ending "— via Viberglass".
4. Pat comments on the issue, mentioning the bot: "@viberglass-bot also check the model viability table". Back in Viberglass: the comment appears in the thread under Pat's name and source, and the agent replies; the reply also appears on the issue.
5. Maria chooses Build it. Cut. The issue gets the pull request's link.
6. (Pre-merged, filmed later) The issue shows the done comment, and the task in Viberglass reads done.

End frame: split screen, the GitHub issue's comment timeline on the left (plan, Pat's comment, the agent's reply, pull request, done) and the Viberglass thread on the right. Caption: "People in the tracker follow and steer the work without leaving it."

Optional cutaway (10 s, admin): Settings → Connections → GitHub, Deliveries, showing a succeeded delivery and an ignored one with its reason.

### 5. A big plan, shipped as small pull requests

Length: 75 to 90 s. Persona: Tomi (engineer) and Maria. Journey: 4 and 10.

Seed: the local-ctx task "Support a YAML configuration file" with a plan in three parts ("Part 1: Parse and validate YAML config", "Part 2: Load it from a --config path and the environment", "Part 3: Document it in the README"), part 1's pull request already merged, the task ready for Build part 2. Do this one only after the parts menu has been tried on a real build; until then, leave the menu out of the cut.

Script:

1. The task's Plan tab, the Parts box: Part 1 Merged, Part 2 Not built, Part 3 Not built. The Code tab: "1 of 3 parts merged".
2. Choose Build part 2. Cut. Part 2 reads PR open; the Code tab lists two pull requests, one merged, one open.
3. Tomi takes over: Take over, the Taken over card with its Checkout commands. A terminal: `viberglass checkout LC-7`, a one-line fix, `git commit`, `git push`.
4. Back in the app: Note for the agent ("Renamed the option to configPath; keep that name"), Hand back. The agent carries on from Tomi's commit. Cut.
5. Optional, once verified: part 3's menu (⋯) shows Mark done and Skip this part; Maria chooses Skip this part because the README change went in another pull request. The Parts box reads Merged, PR open, Skipped.

End frame: the Parts box with each part's state and the Code tab listing the pull requests per part. Caption: "Large plans, reviewable pull requests. Engineers can step in at any point."

### 6. Any agent, any model, including one on your own GPU

Length: 60 to 90 s. Persona: admin, then Tomi on a task. Journey: 8.

Seed: Settings → Agents with the three runners above. Settings → Models with one connected model (z.ai or OVH AI Endpoints) and one deployed model on Verda, already woken once so it starts in seconds, or recorded with the wait cut. A token.observer or local-ctx task with a written plan and a summary.

Script:

1. Settings → Agents: the list of runners, each with its agent, model and Ready.
2. Add a runner briefly: the agent picker showing all eight agents, then the provider list, and Workspace models. Cancel.
3. Settings → Models: Connected models (base URL, format, "Used by"), then Deployed models: "Qwen on Verda", its GPU and hourly price, the mode buttons Scale to zero, Keep warm, Stop, and its state.
4. Deploy a model dialog, opened and not submitted: From vLLM Recipes, a model search, the GPU list with prices.
5. A task: the line naming the agent for the next ask. Bring in another agent → "OpenCode · Qwen on Verda". The thread shows "Bring in … : it starts fresh and reads the summary and the task". If cold, the run reports "Waking …"; cut.
6. The agent's reply in the thread. Open Run details: the harness, the model, time and cost or "cost not reported".

End frame: the thread with two different agents' turns one after the other, and Run details showing the self-hosted model. Caption: "Eight coding agents. Any compatible model. Your servers, or a GPU in Finland."

Keep "experimental" in a caption or voice-over for the deployed model.

### 7. A launch deck from a Files space

Length: 60 to 90 s. Persona: Maria. Journey: 7.

Seed: the Launch materials Files space with `notes/launch-notes.md` and the logo. A task "Launch deck for the October release", not started. Run it once beforehand to check the agent declares the artifact and the deck previews with working navigation.

Script:

1. The space's Files page: the two files. Open `launch-notes.md` in the editor for a second.
2. The task. In the composer: "Six slides from the launch notes, with the logo, one customer quote per slide where it fits." Choose Create artifact. The thread: preparing files, the agent working. Cut.
3. "Saved files · 4 added". The artifact card with its name, Version 1, Preview and Download.
4. Preview: click and press the arrow keys through three slides, then full screen for a moment.
5. In the composer: "Shorter titles, and put pricing on slide 3." Choose Revise artifact. Cut. Version 2 card.
6. The space's Artifacts page: the deck with Version 2 and the task it came from.

End frame: the deck's Version 2 preview in the app, with the thread beside it showing both versions. Caption: "Not only code. Decks and documents, versioned, with live previews."

Say on screen or in the description that Files spaces need object storage, and don't mention publishing to Notion or Google Docs.

### 8. Running in ten minutes

Length: 60 to 120 s. Persona: admin or product leader. Journey: 1.

Seed: a fresh Linux server with Docker and a domain pointing at it; `.env` prepared off screen apart from the visible lines. A disposable repository and token.

Script:

1. Terminal: `git clone`, `cd viberglass`, `cp .env.production.example .env`, show the filled `.env` with secrets blurred, `docker compose -f docker-compose.prod.yml --profile https up -d`. Speed up the pull with an on-screen timer.
2. Browser at the domain, padlock visible. Create the administrator.
3. Connect an AI model: pick the provider, paste the key (off screen), Check and continue. Show the wrong-key error first if there's time.
4. Choose your space backing: Git repository; enter the repository, click Create a token with the right permissions to show GitHub's prefilled form, paste the token, Continue.
5. Name your first space; Create space. Getting your agent ready. Cut.
6. Try your first task: "Explain how this codebase is organised"; Write the plan. Cut to the written plan.
7. Home with Next steps.

End frame: the first plan, written against the repository, with the timer reading the elapsed time. Caption: "One server, three inputs, your first plan."

Hold this video until the first release is published and the one-server install has been run from a clean machine following only the docs; until then the commands may not match the release.

## Overview video (2 to 3 minutes)

Persona: a product team (Maria, Tomi, Quinn, Pat), told from Maria's side. Seed: the whole shared workspace above, with the tasks from videos 1, 2, 4 and 7 prepared to their starting states, plus the background tasks.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 – 0:12 | Maria's Home: Needs you with an agent question, a mention and a review; Your conversations below. | "Coding agents are good at writing code. They don't know what your company actually wants. Viberglass keeps the people who do in the conversation." |
| 0:12 – 0:30 | Ask for something → token.observer → "Show prices in EUR as well as USD" → Create task → Write the plan. | "Anyone can ask. A product manager writes what they want, in plain words, and asks for a plan." |
| 0:30 – 0:45 | The question card "It's for you."; Maria answers; "Wrote the plan"; the Plan tab opens on what the agent found in the code. | "The agent reads the code first. When it's missing a decision, it asks the right person, and waits." |
| 0:45 – 1:05 | Tomi comments on a line, Quinn suggests a change, Revise the plan with 2 comments, Compare with current. | "The team reviews the plan like any document: comments on lines, suggested edits, mentions. One click sends all of it back to the agent, and every version is kept." |
| 1:05 – 1:20 | Build it → Code tab with the open pull request → GitHub review → merged, task done. | "Then it builds, and opens a pull request your engineers review as usual. Large plans ship in parts, a pull request each." |
| 1:20 – 1:35 | The GitHub issue's comment timeline beside the task thread; the Slack thread with `plan.md` and Build it. | "Work can start in your tracker or in Slack, and it reports back there too. People follow along without opening another tool." |
| 1:35 – 1:50 | Tomi: Take over, `viberglass checkout`, push, Hand back. | "Engineers can pause the agent, take over its branch, and hand it back." |
| 1:50 – 2:10 | Settings → Agents with several agents; Settings → Models with a connected model and a deployed model on Verda; Bring in another agent on a task. | "Use the agent you prefer: Claude Code, Codex, OpenCode and five more. Bring your own keys, any compatible model, or one running on a GPU in the EU." |
| 2:10 – 2:30 | The Launch materials Files space: Create artifact, the deck previewing, Revise artifact. | "And it's not only code: spaces backed by files produce decks and documents, with live previews and versions." |
| 2:30 – 2:45 | Terminal with the compose command; Settings → Members with roles; Tomi's sidebar with the private Platform space beside Quinn's, which lists only token.observer; Overview. | "It's open source and self-hosted: one server, Kubernetes or AWS. Your code, keys and conversations stay on your infrastructure." |
| 2:45 – 2:55 | Logo, the repository address and the docs address. | "Viberglass. Bring your team, bring your agents." |

Keep the deployed-model and Files segments to what's verified: label deployed models experimental in the on-screen caption, and film Files on the Docker install.

## Sources

`docs/marketing/user-journeys.md`, the user and admin guide in `docs/guide/`, `docs/artifact-spaces-plan.md`, `docs/model-hosting-plan.md`, `docs/launch-handover.md`, `docs/launch-todo.md`, `docs/testing/e2e-manual/README.md` and `00-clean-machine.md`, the screens in `apps/platform-frontend/src/pages`, `packages/integrations/integration-slack`, and the READMEs of github.com/Ilities/token.observer and github.com/Ilities/local-ctx.
