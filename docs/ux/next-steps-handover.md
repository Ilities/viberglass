# Handover: next steps after the correctness pass

Status as of 2026-09-24 · The correctness pass (PR #38), Step A (PR #39) and the quick-win slice (PR #40) merged to `main`; next is Step C · Owner of decisions: Jussi

This hands the work over to whoever picks it up next, whether a person or an agent session. Read it together with:

- [`user-journeys-and-personas.md`](./user-journeys-and-personas.md): the living UX spec (findings F/LC/FR/FL/PG, personas, journeys J1–J21, roadmap).
- [`docs/adr/`](../adr/README.md): decisions 0001–0004 (git-backed collaborative workspace for software companies; self-hosted and portfolio-first; product leader as primary persona who also does setup; Space and Task naming).
- The appendices in this folder: first-run (FR), failure/cancel (FL), integrations/pages (PG).

---

## 1. Where things stand

### 1.1 Done on the branch

All nine correctness blockers from plan §11.0 are fixed. Each was verified against the running local stack, not just unit tests.

| Commit (subject) | Blocker | Findings | Live evidence |
|---|---|---|---|
| Add UX audit, user journey plan and product ADRs | — | — | docs, ADRs, Postgres `restart: unless-stopped` |
| Run agents inside the cloned repository | 1 | LC1, FL13, PG5 | Automatic research wrote a correct doc about the repo; 0 external-directory rejections |
| Make cancel stop the agent and stay cancelled | 2 | FL1–FL5 | Container gone within 5 s of cancel; job stayed `cancelled`; no doc written; confirm dialog |
| Deliver human feedback to the agent | 3 | LC2, LC5, F33 (correctness part) | A queued PM message produced a "PM NOTE" in the doc, and the session then completed |
| Wire up project archive and the deletion summary | 4 | PG1, PG2 | Archived project leaves lists but stays reachable by id; real counts shown; "Archive instead" offered |
| Fix flaky SSM cache expiry assertion | — | — | Existing test that was off by 1 ms |
| Keep a failed runner start's real error | 5 | FR16 | Unit-tested transition rule |
| Stop saving secrets that have no value | 6 | FR10 | Env secret without a set variable is refused; UI defaults to encrypted storage |
| Create integrations on request and allow removing them | 7 | FR12, PG8, PG9 | GitHub removal refused and names both projects; unused test integrations removed |
| Mock IntegrationUsageDAO in the integration webhook route test | — | — | Fix for a test the previous commit broke |
| Restrict workspace plumbing and project deletion to admins | 8 (partial) | F39, PG14, F7 | Member gets 403 on secrets, runner create and project delete; can still list runners and integrations |
| Recover from a database that starts late, and say when the server is down | 9 | F1 | Backend retried while Postgres was down, served 6 s after it returned; login showed the new message |

**Test totals at handover:**

| Suite | Tests |
|---|---|
| platform-backend unit | 696 |
| platform-frontend | 78 |
| viberator (worker) | 80 |
| agent-core | 14 |

All green at merge time. Step A (below) since added the smoke suite, 11 fake-agent tests and one backend test (697).

### 1.2 Deliberately not done

- **Approvals are still open to any member** (LC3, F27). Admin-only approval would lock out product leaders who aren't admins (ADR 0003). This belongs to the J7 approval policy in Phase 2.
- **ECS and Lambda runs can't be stopped by cancel.** The task ARN or request id isn't stored anywhere. Those runs are marked cancelled and their late results are ignored (a cancelled job is terminal), but the compute keeps running until it finishes. Fix: persist the invoker's `executionId` on the job, and add `EcsWorkerStopper` (StopTask) next to `DockerWorkerStopper`.

### 1.3 Known issues found along the way, still open

| Issue | Where | Notes |
|---|---|---|
| ~~The session's first bubble is the full system prompt~~ Fixed (quick win #1) | `AgentSessionLaunchService.createInitialTurns` | The opening message is shown, and now also reaches the agent for fresh sessions; the full prompt is on the event and turn. |
| A follow-up turn that ends without writing the document leaves the session `active` forever | `api/routes/jobs.ts` result callback, session-turn branch | Only `TURN_COMPLETED` is emitted when `documentContent` is missing. Probably should be a turn failure with a readable reason. |
| Deleting a project still hard-deletes tickets and sessions | migrations 001/046/043 cascades | F31. Archive is the escape hatch now; the real fix is the Phase 4 model change (workspace-owned tasks). |
| `ticketSystem = "custom"` means both "Viberglass-native" and "Custom Webhook" | `CreateTicketPage`, project `ticketSystem` | PG3. F15-class bugs can return. Introduce an explicit native value. |
| The failure classifier matches error text with regexes and mislabels platform bugs | `services/job/classifyJobFailure.ts` | FL12. Part of quick win #13 and J11. |
| Project-level prompt templates are editable by any member | project settings → prompt templates | PG17. Global templates are admin-only now; project ones aren't. |
| 90 stale `viberator/*` branches on the demo repo | GitHub `ilities/token.observer` | LC12, quick win #17. |
| Dead component | `apps/platform-frontend/src/pages/project/tickets/planning-document-panel.tsx` | Not rendered anywhere. Delete it when touching that area. |
| ~~Docker "start" always rebuilds the worker image under the runner's tag~~ Fixed (Phase 1 step 0) | `DockerProvisioningHandler`, `DockerImagePuller`, `DockerImageBuilder` | Docker now honours `provisioningMode: "prebuilt"` (the UI already offered it): start uses the image as is, pulls it with per-layer progress when missing, and falls back to the agent's catalog image. Managed mode still builds. The e2e seed now starts its runner in pre-built mode. |
| Runner config stores up to 200 lines of Docker build log | `deployment_config.strategy.dockerBuild.logs` | Every clanker read carries it. Belongs in job/provisioning logs. |
| Startup errors are logged as `{}` | winston metadata for `Error` objects | "Failed to run migrations on startup, exiting {"error":{}}" hid the cause of the late-database bug. |
| The Pi agent can't be selected in the platform | `AgentType` in `packages/types/src/clanker.ts` | The worker has the plugin; the platform lists, normalisers and DB constraint don't. See `packages/agents/README.md` for every list. |
| `npm run new:agent` leaves the template's placeholder `build`/`test` scripts and a stale `executeAgentCLI` signature | `packages/agents/_template` | Fixed by hand for `agent-fake`. |
| Files over the AGENTS.md size limits | `AgentSessionInteractionService.ts` (~395), `AgentSessionLaunchService.ts` (~420), `SecretService.ts` (~550), `api/routes/projects.ts`, `api/routes/jobs.ts`, `DockerInvoker.ts`, `IntegrationDetailPage.tsx` (~880), `phase-section.tsx` (~620), `ProjectSettingsPage.tsx` | They were already over. Split them opportunistically when a change lands in them, not as a separate refactor. |

---

## 2. Working on this repo: practical notes

### 2.1 Environment

- **Stack:** `docker compose up` gives Postgres :5432, backend :8888 (nodemon hot reload, runs migrations on start), frontend :3000 (Vite HMR). Langfuse (:3001) is optional under the `langfuse` profile (see `docs/telemetry-local.md`).
- **Accounts:** admin `jussi@hallila.com` / `salasana`; member `maria.pm@example.com` / `salasana123` (created for the audit).
- **Test data:** project `ux-walkthrough` (repo `ilities/token.observer`) holds the audit ticket plus several verification tickets. Runner "Opencode Local" (Docker, pre-built `viberator-worker-opencode:latest`).
- **Worker image:** the local image was rebuilt with the PWD fix:

  ```bash
  docker build -f infra/workers/docker/base/base-worker.Dockerfile -t base-worker .
  docker build -f infra/workers/docker/generated/opencode.Dockerfile --build-arg BASE_IMAGE=base-worker -t viberator-worker-opencode:latest .
  ```

  The build uses the working tree as-is. Worker code changes (`packages/agent-core`, `apps/viberator`) only take effect after a rebuild; backend and frontend changes hot-reload.

### 2.2 Committing alongside other work

Jussi's telemetry and worker changes, previously uncommitted, landed in "Modify local runs to contain telemetry from OTEL so we can create evals". That includes the GIT_CONFIG_COUNT fix in `GitService.ts` (PG4's platform bug), the OTEL passthrough in `DockerInvoker.ts`, the worker Dockerfiles and the Langfuse compose profile. The working tree was clean at handover.

If someone else's uncommitted hunks share a file with your change:
- Build a patch against `HEAD` and `git apply --cached` it.
- Otherwise commit with `git commit -- <paths>`.
- Check `git diff --cached --stat` before every commit.

Jussi rewords commits in IntelliJ, so hashes change. Refer to commits by subject.

### 2.3 Commands that work

```bash
# Tests
(cd apps/platform-backend && npx jest src/__tests__/unit)      # backend unit
(cd apps/platform-frontend && npx jest)                         # frontend: Jest, not Vitest
(cd apps/viberator && npx jest); (cd packages/agent-core && npx jest)
npx tsc --noEmit -p apps/platform-backend; npx tsc --noEmit -p apps/platform-frontend

# If the frontend type-check complains about an integration plugin's `id: string`,
# a package's dist is stale:
npm run build -w @viberglass/integration-core -w @viberglass/integration-<name>

# Database
docker exec viberglass-dev-postgres sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -c "select ..."'

# API as admin (cookie session)
curl -s -c /tmp/cj.txt -H 'Content-Type: application/json' \
  -d '{"email":"jussi@hallila.com","password":"salasana"}' localhost:8888/api/auth/login
curl -s -b /tmp/cj.txt -F projectId=<id> -F title=... -F description=... localhost:8888/api/tickets
curl -s -b /tmp/cj.txt -H 'Content-Type: application/json' -d '{"clankerId":"<id>"}' \
  localhost:8888/api/tickets/<ticketId>/phases/research/run
curl -s -b /tmp/cj.txt -H 'Content-Type: application/json' \
  -d '{"clankerId":"<id>","mode":"research","initialMessage":"Start research"}' \
  localhost:8888/api/tickets/<ticketId>/agent-sessions            # live session
curl -s -b /tmp/cj.txt -H 'Content-Type: application/json' -d '{"messageText":"..."}' \
  localhost:8888/api/agent-sessions/<sessionId>/message
curl -s -b /tmp/cj.txt -X POST localhost:8888/api/jobs/<jobId>/cancel
```

**UI verification** follows AGENTS.md §9 (agent-browser):
- One command per call, and never chain or parallelise commands against one session.
- Custom selects are listboxes: click the combobox, then the option.
- The daemon sometimes returns "Resource temporarily unavailable". Re-snapshot and retry.

### 2.4 Things that bit us

- **`PWD` vs `cwd`.** Spawned CLIs inherit `PWD`, and some harnesses (OpenCode 1.18 `run`) use it as the project root. Anything that spawns an agent must go through `withWorkingDirectory` (`packages/agent-core/src/workingDirectoryEnvironment.ts`).
- **Prompt template variables are stringly typed.** The revision templates expect `revisionMessage`, `ticketTitle`, `ticketDescription`, `researchDocument`, `planDocument` and `openComments`. Passing the wrong name fails silently, and the variable renders empty. Check migration `057_xml_tag_templates.ts` when rendering a template. A typed variable map per `PROMPT_TYPE` would prevent this whole bug class; worth doing in Phase 1 or 2.
- **Unconsumed user turns** now mean "messages the agent hasn't seen". Opening turns are marked consumed at launch (migration 065). Anything creating turns must keep that invariant.
- **Cancelled is terminal** (`services/job/jobStatus.ts`). Worker callbacks for cancelled jobs get 409.
- **Deleting an integration cascades** to projects' SCM configs and credentials. The delete guard (`IntegrationUsageDAO`) exists for that reason.

---

## 3. Next steps, in priority order

### Step A: End-to-end smoke test (Phase 0 exit): done

On branch `e2e-smoke-test`. `npm run test:e2e` resets the e2e database and runs six journeys in about 75 seconds against the real backend, frontend and Docker workers, with no model keys. Three consecutive runs passed. How to run and extend it: `TESTING.md` → E2E Tests.

**Journeys covered:** sign-in; automatic research → document → approve; live session with a message queued mid-turn; cancel; member vs admin (API and navigation); backend starting before Postgres.

**What it took:**
- **Fake agent** (`packages/agents/agent-fake`): writes `RESEARCH.md`/`PLAN.md` echoing its prompt, and obeys `[fake:sleep=N]`, `[fake:no-document]` and `[fake:fail]` in the task text. One-shot runs execute it in-process; live sessions spawn its small ACP server. It is marked `testOnly`: hidden from the runner picker and never provisioned or pushed by infrastructure. The platform had to learn the agent in several hardcoded lists, now documented in `packages/agents/README.md` (AGENTS.md used to say none were needed).
- **Self-contained stack:** its own ports beside the dev stack, Postgres on tmpfs, a fixture git repository served over plain HTTP to worker containers, and seeding through the public API.
- **Legacy specs quarantined:** the 78 older specs (5 of 83 passed at baseline, all failing on a login user that was never seeded) now run only with `npm run test:legacy -w @viberator/e2e-tests`. Revive or delete them one by one.

**Bugs it found, fixed on the branch:**
- Backend CI on `main` failed since the telemetry commit: `@viberglass/telemetry` was never built before tests or in `Dockerfile.prod`.
- A backend that starts before a *freshly created* Postgres still crashed (blocker 9 covered only a restarting one): the connection resets during initialisation (`ECONNRESET`, "Connection terminated unexpectedly") weren't treated as "not reachable yet".

### Step B: UX quick wins (plan §11.1), about 1–1.5 weeks

**Decided (decision 3): a short slice first, then Phase 1.** The slice is the quick wins that decide whether a first run reads as a success or a confusing failure, which Phase 1's first-result goal depends on:

1. **#15**: disable Run/Revise while a run or session for that phase is active.
2. **#4**: status truth (no "In Progress" when nothing runs).
3. **#9 + #13**: readable failure reasons from structured worker error codes, with copy per audience.
4. **#1**: session opens with the human's intent; the system prompt goes behind "View full prompt".

About 4–5 days, on branch `quick-win-slice`. **Slice done (2026-09-23)**, merged in PR #40: all four items landed with a smoke journey each (14 journeys total), plus two bugs found on the way (tickets in review read back as open; a live session's opening message never reached the agent). Test totals: backend 708, frontend 98, viberator 91, agent-core 14. Decisions 4–6 answered (2026-09-24); next is Phase 1. Cover each item with a smoke journey using the fake agent (for example `[fake:fail]` for failure copy). Decisions 4–6 get answered in the meantime; Phase 1 starts with a Docker pre-built image mode. The remaining quick wins fit alongside or after Phase 1.

**Status after the correctness pass:**
- **Done:** #5 (plumbing hidden from members, routes enforced), #10 (server-unreachable message), #12's "cancel keeps history" part.
- **Partly done:** #1 (prompt accurate, still shown raw), #11 (new integrations get a chosen name; the duplicate GitHub token field remains).

**Remaining, in suggested order:**

| # | Item | Main files | Acceptance |
|---|---|---|---|
| 15 | ~~Disable Run/Revise buttons while a run or session for that phase is active~~ **Done** on `quick-win-slice`: the backend refuses (409) a run, revision or session while one is queued, running or open for the ticket and phase; the page disables the buttons with the reason and re-enables them when the run ends | `TicketPhaseRunGuard`, `phase-section.tsx` | No duplicate runs from the ticket page |
| 14 | Execution confirmation: "Pushes branch `x` to `repo`, opens a PR against `base`" | `components/run-ticket-modal.tsx` (execution mode) | Repo, branch template and base shown before start |
| 4 | ~~Status truth~~ **Done** on `quick-win-slice`: phase headers say Not started / Agent working / Awaiting review / Failed / Cancelled; the ticket status is `in_progress` only while a run is queued or active, `in_review` while a document or PR waits on a human (labels "Agent working" and "Awaiting review" everywhere); migration 067 re-derives existing tickets. Failure *reasons* come with #9/#13 | backend ticket/phase status derivation, `phase-section.tsx` header, Pulse (`/sessions`) | Status never says "In Progress" when nothing runs |
| 13 | ~~Failure copy by audience: plain status for requesters; "Fix setup" only for configuration failures, only for admins; Retry for agent failures; reason column in Runs~~ **Done** on `quick-win-slice` (with #9): the worker reports a `JOB_FAILURE_CODE` from the stage that failed; the backend maps codes to title, summary and category (setup / agent / platform) and no longer reads error text; the run page, Runs list (Reason column) and phase header show copy by audience | `services/job/classifyJobFailure.ts`, `pages/project/jobs/*`, phase header | Each FL/PG failure case shows the right audience copy |
| 9 | ~~Readable reasons for the top causes: credential expired, credit/quota exhausted, repo access denied, agent produced no document~~ **Done** on `quick-win-slice` (with #13): the worker reports a `JOB_FAILURE_CODE` from the stage that failed; the backend maps codes to title, summary and category (setup / agent / platform) and no longer reads error text; the run page, Runs list (Reason column) and phase header show copy by audience | `classifyJobFailure.ts` plus worker error codes | Classify on structured codes from the worker, not error-text regexes |
| 6 / 16 | Show names, not emails: comment author, session starter, approver, canceller (`cancelledBy` is stored, never shown) | comment DAO/actor fields, collaboration history, session header | No email addresses where a name is known |
| 1 | ~~Session: first bubble shows the human's intent; system prompt behind "View full prompt"; session title = task title~~ **Done** on `quick-win-slice`: the opening bubble is what the person wrote, the full prompt is behind "View full prompt", and the session is titled with the task. Sessions started before this keep their old first bubble | `SessionPage.tsx`, `phase-session-panel.tsx`, launch service (store intent on the turn) | A PM can read the opening of a session |
| 8 | "● Live" badge plus join link on task cards and page | tickets board/table, `phase-section.tsx` | A teammate can find and join a live session from the board |
| 2 | Replace whimsical functional copy; apply the Space/Task glossary (ADR 0004) to copy | `pages/dashboard/*`, project dashboard, nav labels | Copy only; URLs and code names move in Phase 2 |
| 3 | SCM dropdown placeholder "Select an integration…" | `NewProjectPage.tsx`, `ProjectSettingsPage.tsx` | — |
| 7 | Bold inside list items renders | markdown renderer config | — |
| 12 | Readiness banner shows the real next step, in order, with a "Ready, try your first run" state (FR7/FR8) | `components/project-readiness.tsx`, `ProjectReadinessService.ts` (credentials check counts inactive runners wrongly) | Largely superseded by Phase 1; do only the FR8 correctness fix if Phase 1 comes next |
| 11 | Remove the duplicate GitHub API token field under Feedback | GitHub integration frontend plugin | One token per connection |
| 17 | Branch hygiene: delete agent branches of failed or cancelled runs | worker `GitService` / result handling | Opt-in setting |

### Step C: Phase 1, three-input setup (the product-leader win), about 2–3 weeks

**Goal (ADR 0003, J1):** a product leader who has never seen Viberglass goes from first page load to a first agent result alone. Required inputs: model API key, repo URL + token, space name. Everything else is defaulted.

**Decided (2026-09-24):**
- **Every selectable agent harness is supported from the first cut** (decision 4): Claude Code, Codex, Gemini CLI, Qwen CLI, Kimi Code, Mistral Vibe and OpenCode, plus Pi once the platform can select it (§1.3). `fake` stays test-only. Building for all of them now forces the right abstraction instead of an Anthropic/OpenAI special case that gets reworked later. Consequences:
  - Setup knowledge lives in each agent plugin as data plus a small capability: the provider's display name, the env variable(s) for the key, a key-format hint, the "where do I get this" URL, and `testCredentials` (live call, errors mapped to invalid key / no credit / rate limited). `SetupService` iterates the registry; no per-provider `if/else`.
  - Key prefixes can't tell every provider apart (`sk-` is shared by OpenAI, DashScope/Qwen, Moonshot/Kimi and others). The key screen therefore picks the provider first, with a prefix match only as a pre-selection hint and a format check. This updates J1 step 2, which assumed detection.
  - OpenCode is the harness for keys whose provider has no harness of its own, so the plugin API needs "provider" and "harness" as separate concepts.
  - Every harness needs its pre-built image available locally for Docker. `workerImageCatalog.json` already lists `defaultForAgents` per image.
- **First user: keep the existing first-admin registration** (decision 5). `/setup` starts after sign-in. There is no workspace name concept in the code, so it's dropped from the flow rather than added.
- **Demo seed is in the first cut** (decision 6).
- **AWS is a first-class self-hosted path, not only `docker compose`** (ADR 0002, amended). Compose is for development and local experimentation; AWS (ECS/Lambda, images in ECR) is the production path. Setup must work on both:
  - The default agent's compute comes from what the instance has: ECS Fargate when the `VIBERATOR_ECS_*` stack outputs are configured, otherwise local Docker. Lambda stays an advanced option, since its 15-minute limit doesn't suit live sessions. (Confirmed 2026-09-24.)
  - On AWS, the pre-built images are already in ECR (the `deploy-viberators` workflow). On compose, setup pulls the image on first run; that's acceptable (Jussi, 2026-09-24).
  - The Phase 1 walkthrough and e2e cover compose. The AWS path needs at least one manual walkthrough on the dev stack before Phase 1 counts as done (agreed 2026-09-24).

**Backend work:**

1. **`SetupService` plus `/api/setup` routes** (new, small classes per AGENTS.md):
   - `POST /api/setup/model-key` `{ provider, key }`:
     - The provider is picked in the UI; a key prefix only pre-selects it and checks the format (see "Decided" above).
     - Make a live test call and map errors to plain language (invalid key / no credit / rate limited).
     - Store it as an encrypted database secret named after the provider's variable (`ANTHROPIC_API_KEY`, …).
     - Provider metadata and testing belong in the agent plugin registry (a `testCredentials` capability per agent plugin), not in `if/else`.
   - `POST /api/setup/repository` `{ url, token }`:
     - Normalise `owner/repo` or a URL.
     - Check access with the GitHub API: repo readable, push permission, default branch. Return plain messages such as "can read but can't push".
     - On success, create the GitHub integration (named "GitHub"), an integration credential backed by an encrypted secret, and set it as default. Reuse the integration if one exists.
   - `POST /api/setup/space` `{ name }` creates the project with SCM config (repo, default branch, credential) and links the integration.
   - **Default agent:** if no active runner exists, create one for the detected provider's harness with the Docker strategy and the pre-built image from `workerImageCatalog.json`. Attach the key secret, then start provisioning in the background.
     - Check `ClankerProvisioningOrchestrator` / `DockerProvisioningHandler` for pre-built vs managed images.
     - Prefer pre-built images so the first run doesn't wait for a build. Pull if missing, and report progress.
2. **Readiness becomes workflow-aware** and drives the wizard's "what's left" (fixes FR8's inactive-runner credential check).
3. **Demo seed (in the first cut, ADR 0002):**
   - `npm run seed:demo` or a "Explore a demo workspace" button loads members, a sample space and tasks in every state.
   - It must be clearly separate from real data and removable.

**Frontend work:**

1. **`/setup` flow** (one screen per input), after the existing first-admin registration: model key (provider picker, then key) → repository → space name → "Getting ready…" → first task composer prefilled with a safe starter.
   - It shows when the workspace has no active agent or no space, and it's resumable. It works on both deployment paths; the only difference is where the default agent runs.
2. **Everything removed from the flow moves under Settings → Advanced** (runners, deployment strategies, webhooks, prompt templates, secret storage modes), as in plan §6.1.
3. **Empty dashboard:** replace the competing CTAs (FR3) with "Finish setup" until done.

**Acceptance (plan §10 bars):**
- 3 required inputs and at most 6 screens to the first task.
- Setup takes 5 minutes or less of user effort, excluding the first image pull.
- No backend-log lookups needed.
- Every input is validated live in plain language.
- A scripted walkthrough, run the way the audit was (fresh database, agent-browser), passes. Add it to the Step A e2e suite with the fake agent.

**Done first (2026-09-24): Docker pre-built image mode** (§1.3). Unit-tested, live-checked against the Docker daemon (pull, reuse, readable pull failure), and exercised by every smoke run through the seed.

**Done (2026-09-24): public worker images on GHCR.** `publish-worker-images.yml` publishes the base image and every agent's default image (from the catalog's new `public` scope) to `ghcr.io/ilities/<repository>` for amd64 and arm64, tagged `latest`, the commit SHA and the release tag. ECR stays for ECS/Lambda. Decided with Jussi: the default path pulls from GHCR; building locally on first run (managed mode) stays available but only as an explicit expert choice, never a default.
- **Before the first run:** GHCR creates new packages as private. After the workflow first publishes, set each `viberator-*` package to public (org → Packages → package settings), or pulls will be refused.
- **Setup still needs:** the compose stack to default `VIBERATOR_WORKER_REGISTRY` to `ghcr.io/ilities` so a catalog image resolves to a pullable name. Do it with the default-agent work in `SetupService`; runners with an explicit image are unaffected.

**Done (2026-09-24): providers and the model-key step.**
- **Providers vs harnesses.** `MODEL_PROVIDERS` (`packages/types/src/modelProviders.ts`) holds one entry per kind of key: display name, key page, distinctive key prefixes and a key check request. Ids follow models.dev, which OpenCode uses. First cut: Anthropic, OpenAI, Google, Mistral, Alibaba (pay-as-you-go, Coding Plan), Kimi Code, Moonshot, OpenCode Go, OpenRouter, DeepSeek, xAI, Groq. The last five run on OpenCode, and OpenCode Go is OpenCode's default (Jussi, 2026-09-24). The extra providers were my pick for "OpenRouter + more"; each is one entry to add or drop.
- **Bindings live with the plugins.** Each plugin declares `providers` (env var, default flag, model/endpoint when needed); `npm run generate:catalog` writes `agentProviderCatalog.json` and enforces one default harness per provider. Pi declares Anthropic but is filtered out until the platform can select it.
- **Key check:** one request per provider that needs a valid key and generates nothing (decided: no one-token completion, so "no credit" shows at the first run instead). Usually GET on the model list; OpenCode Go and Alibaba Coding Plan have public model lists, so they POST an incomplete completion and treat 400 as "key accepted". Errors are plain language: rejected / refused access (restricted key) / no credit (402) / rate limited / provider error / unreachable from this server.
- **API:** `GET /api/setup/providers` and `POST /api/setup/model-key` (admin only). The key is stored under the default harness's env var, encrypted in the database; saving again replaces it in place (an SSM secret stays in SSM; an env-backed one is refused with an explanation).
- **Verified:** unit tests, plus a live run against all 13 providers with an invalid key (all rejected; the first run caught the two public model lists). **Verified with a real OpenCode Go key** (the one stored as `OPENCODE_API_KEY` in the dev database): HTTP 400 "MissingSessionID", i.e. authenticated and then refused, while an invalid key gets 401 AuthError on the same request. OpenCode Go checks the model, then the key, then an `x-opencode-session` header only OpenCode sends; the check relies on that order. **Not yet verified with real keys:** the other providers' valid-key side (plain GETs, low risk) and Alibaba Coding Plan's 400.
- **Default models** for OpenCode providers (and Moonshot) are pinned in the plugin bindings and will age; they're changeable per runner under Advanced.

**Next in Step C:** `POST /api/setup/repository`, `POST /api/setup/space`, then the default runner (binding's harness, the instance's compute, the key's secret attached, `model`/`endpoint` from the binding; check the platform's agent config normalisers keep `model`/`endpoint` for Kimi and Qwen), and `VIBERATOR_WORKER_REGISTRY=ghcr.io/ilities` for compose.

**Answered (2026-09-24):** pulling a worker image of several hundred MB on first run is fine. "Getting ready…" shows progress.

### Step D: Phase 2, people primitives, about 3–5 weeks (outline)

**Order matters:** each step unlocks the next.

1. **Naming migration** (ADR 0004): Space/Task in UI copy, routes and public API, with redirects from `/project/*`. Internal names can move later.
2. **Invites:** single-use links that work without SMTP (ADR 0002); pending and revocable; the admin never sees passwords (J3).
3. **Space membership:** mount the existing `requireProjectAccess` middleware, filter lists by membership, and add a members UI.
4. **Task participants:** requester (auto), owner, reviewers, watchers. Human-readable task keys (`WEB-42`).
5. **Discussion thread on tasks with @mentions,** plus an append-only **Activity** log (who did what, when).
6. **Inbox + notifications** (in-app first, then Slack DM, email if SMTP is configured): questions, review requests, mentions, failures you own (J10, plan §8).
7. **Approval policy per space/workflow** (J7): who may approve research, plan and execution; "Request review from…"; approvals attributed. This closes the approvals part of blocker 8.
8. **Rendered-document inline comments** (not markdown source only).
9. **Audit log.**

**Design decisions needed:** role model per space (owner/maintainer/member/guest?), notification defaults, and whether guests (P8) arrive in this phase or later.

### Later phases

See plan §12:
- **Phase 3:** agent ↔ human questions, readable transcripts, steer/pause/take over.
- **Phase 4:** workspace-owned tasks, archive-not-cascade, workflow templates as data.
- **Phase 5:** git-backed non-code workflows for product, design and QA.

Phase 3's agent questions (J6) are the next big collaboration win after the Phase 2 primitives exist.

---

## 4. Decisions waiting on Jussi

| # | Decision | Needed before |
|---|---|---|
| 1 | ~~Merge strategy for `ux-plan-and-core-fixes`~~ Merged to `main` (PR #38). | — |
| 2 | ~~Is a fake agent plugin acceptable?~~ Yes; added as `agent-fake`, test-only. | — |
| 3 | ~~Quick wins or Phase 1 first?~~ A slice of quick wins (#15, #4, #9 + #13, #1), then Phase 1. See Step B. | — |
| 4 | ~~First-cut providers for three-input setup~~ All selectable harnesses, behind one plugin abstraction. See Step C. | — |
| 5 | ~~Setup vs first-admin registration~~ Two: keep the existing registration, `/setup` after it. | — |
| 6 | ~~Demo workspace seed~~ In Phase 1. | — |
| 7 | Space role model and notification defaults | Step D |

---

## 5. Working agreements that held up

- **Find the root cause before fixing.** Several symptoms looked like UX problems but were correctness bugs (PWD, template variables, a missing route). Reproduce, read the logs (`job_log_lines`), then fix.
- **Verify in the running app every time**, and say how in the commit message. A fix counts as done only when the live check passes.
- **Follow AGENTS.md:**
  - Small single-purpose classes.
  - Constructor injection with defaults, matching local style.
  - No `as` casts; narrow interfaces instead (see `DockerContainerLookup`).
  - Run the full suites (not just targeted ones) before committing.
- **One commit per fix.** Explain why in the body; end with the co-author line.
- **Keep the plan current.** Update `user-journeys-and-personas.md` and the ADRs when a decision changes. Mark status in §11/§12 as items land.
