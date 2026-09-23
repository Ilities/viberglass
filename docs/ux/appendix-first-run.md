# First-run walkthrough against an empty database (FR series)

Walkthrough performed 2026-09-23 on an isolated second stack: empty DB `viberglass_firstrun` in the existing `viberglass-dev-postgres`, a second backend on :8889 and a second frontend on :3002. Both used the same images and the current working tree. The existing DB and containers were not touched. Persona: P1 Olli, a new self-hosting admin following the UI and README. All values were fake (`sk-ant-FAKE…`, `ghp_FAKE…`, repo `github.com/viberglass-firstrun-uxtest/does-not-exist`). Nothing was created on external services. Screenshots: `/tmp/ux/firstrun-01…40-*.png`.

Severity: **S1** blocks or misleads the journey · **S2** major friction · **S3** polish. Cross-refs: F1–F40 in `docs/ux/user-journeys-and-personas.md` §2.

Environment caveat: at first the second backend ran **without** the Docker socket, so it would not rebuild shared worker image tags. That is how FR16 showed up. Later I remounted the socket, set `PLATFORM_API_URL=http://host.docker.internal:8889` so workers could not call the main backend, and used "Pre-built" mode with the existing `viberator-worker-opencode:latest` image, so nothing was built. On stock compose a real user would wait for a managed image build at that step. I did not time it.

## Findings

### Registration / first contact
| # | Sev | Finding |
|---|---|---|
| FR1 | S2 | The setup page is only "Create the first administrator" (name, email, password ×2). No product sentence, no workspace/org name, no "what happens next". It doesn't say it's one-time or that it grants admin, which the README does. (`firstrun-01-setup.png`) |
| FR2 | S2 | A password under 8 chars shows only **"Validation error"**. The API returns `details:[{field:"password",message:"\"password\" length must be at least 8 characters long"}]`, but the UI discards the detail. The rule isn't shown up front. Mismatched passwords do get a clear client-side message. (`firstrun-02-validation.png`) |

### Empty dashboard & ordering
| # | Sev | Finding |
|---|---|---|
| FR3 | S1 | The empty "Command Deck" has **competing primary CTAs**: "Launch Project" (centre), "Configure agent runner" (side), plus "New Project" in the header and sidebar. There's no checklist or order, and nothing mentions secrets or integrations, the real first steps. The natural choice ("Launch Project") is the **wrong first step**: its form has every SCM field disabled. (`firstrun-03`; extends F3/F4) |
| FR4 | S1 | **Order dependency is invisible and punishes the wrong order.** If the GitHub integration exists *before* the project, the New Project form enables SCM right away. If the project came first (as the dashboard invites), the integration must later be **linked** under Project → Settings → Integrations → "Link to Project" before the SCM dropdown in Settings enables. Settings never says linking is what's missing ("Link a GitHub/GitLab/Bitbucket integration in project integrations"). Cost: 3 extra hops. (`firstrun-22/23/24`) |

### Project creation form
| # | Sev | Finding |
|---|---|---|
| FR5 | S2 | The hint "Create a GitHub, GitLab, or Bitbucket integration" links to the generic Integrations list (not GitHub), where **GitLab and Bitbucket are "Coming Soon"**. The link looks almost like body text. Browser Back returns to an **empty form**: the typed name is lost. (`firstrun-04/05`; confirms F11 on a fresh DB) |
| FR6 | S2 | A project can be created with only a name. SCM can then be added only in Settings. The project opens on "Mission Control" with a joke subtitle, not a "finish setup" step. |

### Readiness banner
| # | Sev | Finding |
|---|---|---|
| FR7 | S2 (positive, with gaps) | A **readiness banner** now shows on the project dashboard, create-ticket form and ticket page: Repository / SCM credential / Agent runner / Agent credentials, each with "Fix setup" and "You can submit tickets now". This is a real improvement on F10/F11. Gaps: <ul><li>Items are **unordered**.</li><li>Secrets and the integration itself aren't listed, yet you can't fix "SCM credential" without an integration.</li><li>Runner/credential "Fix setup" goes to the generic `/clankers` list, not the specific runner or its Start.</li><li>When everything turns green the banner **just disappears**. There's no "Ready: try your first run".</li></ul> (`firstrun-06/26/33`) |
| FR8 | S1 | **"Agent credentials: Add model credentials to an agent runner" stays red after credentials are attached.** `ProjectReadinessService` uses `activeRunners.some(r => r.secretIds.length > 0)`. An inactive runner *with* `ANTHROPIC_API_KEY` still says "add credentials", which sends the admin to re-add a key when the real problem is Start. The check also passes for a secret that can't resolve (FR10). |
| FR9 | S2 | The Repository check passes for any non-empty string. `acme/web` (no host) was saved unvalidated and ticked green. The first run then failed with `fatal: repository 'acme/web' does not exist`. The placeholder shows `https://github.com/org/repo`, but nothing enforces it or tests access. (`firstrun-25/35`) |

### Secrets
| # | Sev | Finding |
|---|---|---|
| FR10 | S1 | **Add Secret defaults to "Name only (env)" and shows no value field.** Clicking the suggested `ANTHROPIC_API_KEY` chip then "Create Secret" gives a green "Secret created", and the list shows `Env`, reference "—". The value is actually read from `process.env.ANTHROPIC_API_KEY` **on the API server**, which stock compose doesn't set. It fails only at run time (`SecretService.resolveSecretValue`: "Environment variable … is not set"). The value field appears only after switching to "Database (encrypted)". This is the most likely first-run trap. (`firstrun-15/16`) |
| FR11 | S3 | No format check or "Test" for secret values (a fake `sk-ant-FAKE…` was accepted). The edit (pencil) button has **no accessible name**. (`firstrun-17`) |

### GitHub integration & credential
| # | Sev | Finding |
|---|---|---|
| FR12 | S1 | **Visiting `/settings/integrations/new/github` creates an integration.** The page renders "Not Configured", then flips to **"Configured"**, and a row `GitHub 2026-09-23 06:54:58` appears in `integrations`. Its timestamp is UTC while the UI shows local 08:54. This happens with no input and no credential, so curious clicks leave ghost integrations. (`firstrun-18`; extends F12) |
| FR13 | S2 | "Add Credential" *does* allow inline secret creation (Secret Source → "Create new secret"), which is good. But: <ul><li>It defaults to "Use existing secret", and that list offered `ANTHROPIC_API_KEY` as a GitHub credential (no type filtering).</li><li>A fake `ghp_FAKE…` token was accepted with no validity or scope check.</li><li>The saved credential shows **"Secret: Unknown"** (F17).</li><li>"Set as default credential" is off even for the first and only credential, so the project's credential dropdown isn't preselected.</li></ul> (`firstrun-19/20/21`) |
| FR14 | S3 | A separate "GITHUB API TOKEN" field under Feedback asks for the token again (F17). The webhook card says "…into **Viberator**", mixing product names. |

### Agent runner
| # | Sev | Finding |
|---|---|---|
| FR15 | S2 | A runner can be **saved with no deployment strategy and no secrets**. Nothing is preselected, though the README calls Docker "the simplest local setup". The subtitle says "for your **Viberator** tasks". The empty state says "No **clankers** registered … Create a clanker" above a "Create agent runner" button. (`firstrun-10/11`) |
| FR16 | S1 | **The real Start failure reason is overwritten.** Start → "Deploying / Starting clanker…" → back to **"Inactive · Docker image not configured"**. The real cause (`connect ENOENT /var/run/docker.sock`) was only in the backend log. `POST /clankers/:id/start` stores `status=failed, message=<error>`, but on the next GET `refreshClankerStatus()` (`apps/platform-backend/src/api/routes/clankers.ts:48`) calls `resolveAvailabilityStatus` and replaces it with `inactive / Docker image not configured`. Any build or provisioning failure looks like a config gap. (`firstrun-13/29/30`) |
| FR17 | S2 | Start without a strategy shows tiny red inline text by the buttons ("Deployment strategy not configured"), with no link to Edit. "Managed" mode says "Image will be built from the **project** Dockerfile on start", which reads as the user's repo, not Viberglass's worker Dockerfile. No progress, duration estimate or build log. |
| FR18 | S3 | You can pair **Claude Code** with the `viberator-worker-opencode` pre-built image. It shows "Active · Docker image ready" with no mismatch warning. |

### Ticket before setup and first runs
| # | Sev | Finding |
|---|---|---|
| FR19 | S2 | Creating a ticket before setup works and the banner says so (good). Problems: <ul><li>The ticket immediately shows **Research: In Progress (Current)** (F24).</li><li>After a failed run it shows **"In Progress" next to "Research failed"**.</li><li>The dashboard lists it under "AWAITING ASSIGNMENT", but there are no assignees.</li><li>The card is tagged **"Custom Webhook"** although it was created in the UI.</li><li>The global dashboard counts it as "Unresolved **Bugs**: 1" (F5).</li></ul> (`firstrun-08/26/37/40`) |
| FR20 | S2 | "Run Research" is enabled while the banner is red. The modal explains in jargon. No runners: "No **clankers** are configured yet → Configure Clankers". Inactive runner: "You have 1 configured clanker, but none are "started". The ECS task definition, container, or Lambda isn't deployed depending on the type." It offers three buttons (Configure Clankers / Open Clanker Configuration / View Clanker Status) but no Start. The first "Configure Clankers" click didn't navigate; it took a second click. (`firstrun-09/31`) |
| FR21 | S3 (positive) | **Run failures are explained well now**: "Run needs attention · Viberglass could not access the configured repository · Check the repository URL and credential permissions", with **Fix setup** / Return to ticket and collapsible Technical details. Clicking Run jumps to the run page. Gaps: with a bad token the detail is `could not read Username for 'https://github.com': terminal prompts disabled`, which doesn't say whether the token was missing or rejected. The ticket page shows only "Research failed", no reason. (`firstrun-35/36/39`; partly addresses F22) |
| FR22 | S3 | The activity axis reads "8am, 10am, **12am**, 2pm". "Project settings saved." renders at the top of a long page, out of view of the Save button. After a backend restart there's a bare white "Checking your session…" screen for about 3 s. |

### README vs reality
| # | Sev | Finding |
|---|---|---|
| FR23 | S2 | The README order is Secrets → Clanker → Start → Project → Tickets. It omits three things: <ol><li>Choosing **Database** storage. The default "Name only (env)" silently fails (FR10).</li><li>Creating the **GitHub integration + integration credential**. Step 1 says put `GITHUB_TOKEN` in *Secrets*, but projects take an *integration credential*.</li><li>**Linking** the integration if the project already exists (FR4).</li></ol> It also lists GitLab as supported SCM, and the UI hint lists GitLab/Bitbucket, but both are "Coming Soon". |

## Step-by-step log (natural path)

| t (min) | Step | Hop # |
|---|---|---|
| 0:00 | Open :3002 → first-admin setup; short password → "Validation error"; fix | 1 |
| 0:30 | Empty Command Deck → centre CTA "Launch Project" | 2–3 |
| 1:00 | New Project: SCM disabled → "Create a GitHub… integration" → generic list → Back → name lost | 4–5 |
| 1:30 | Create project with name only → Mission Control + banner (4 red items) | 6 |
| 2:00 | Create Ticket (allowed) → ticket shows "Research In Progress" | 7–8 |
| 2:30 | Run Research → "No clankers…" → Configure Clankers (2 clicks) → runner list | 9 |
| 3:00 | Create agent runner with name only → saved → Start → "Deployment strategy not configured" | 10–11 |
| 3:30 | Secrets → Create → ANTHROPIC_API_KEY chip → Create (env, no value, "created") | 12 |
| 4:00 | Value field found only after switching storage to Database; edit + save | – |
| 4:30 | Integrations → GitHub (integration auto-created on visit) → Add Credential → Create new secret → fake token | 13–14 |
| 5:30 | Project Settings: SCM still disabled → Manage Links → Link to Project → back | 15–17 |
| 6:00 | Choose GitHub, repo `acme/web`, save (credential not preselected) → dashboard: Repository ✓ | 18 |
| 6:30 | Settings again → choose credential → save (confirmation off-screen) | 19 |
| 7:00 | Runner Edit → key + Docker → Save → Start → "Inactive · Docker image not configured" (real error hidden) | 20–21 |
| 8:30 | Workaround needing insider knowledge (socket + Pre-built image) → Start → Active | 22–23 |
| 10:00 | Ticket → banner gone → Run automatically → run page: "could not access repository" | 24–25 |
| 11:00 | Fix setup → full URL → rerun → auth failure shown | 26–28 |

**Result:** reaching the **first runnable ticket** (all readiness checks green, an active runner, Run enabled) took **about 10 minutes, 25 page hops and 5 modals**. That was for an agent that knew the code and skipped the image build. The path had **two silent dead ends** (FR10 env secret, FR16 hidden Start error) that a real admin could only diagnose from backend logs. Knowing the correct order in advance, the minimum is **about 9 hops**: Secrets → Integrations → GitHub + credential → New runner → Start → New project with SCM → Create ticket → Ticket → Run. A managed Docker build on Start adds build time I didn't measure. A successful run was not possible without real keys.
