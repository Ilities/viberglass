# Plugins: what's left

Steps to make harnesses and integrations plugins chosen by build config ([ADR 0015](adr/0015-harnesses-and-integrations-are-plugins.md)). Collected 2026-10-09. Each step ships on its own and keeps current behaviour. Delete steps as they're done, and this file with the last one.

The target for every step: nothing outside a plugin's package names it, except test fixtures.

## Done

- `viberglass.plugins.json` lists the plugins in a build. `npm run generate:plugins` writes the registrations for the worker, backend and frontend, and each app's plugin dependencies. The worker build, the frontend and backend build scripts, amplify, the Dockerfiles, the catalogs and the generated worker Dockerfiles read it. The scaffolding scripts add new plugins to it.
- `TicketSystem` is an open string, and the database no longer constrains harness, ticket system or webhook provider ids.
- New runners can only use harnesses in the build (`AVAILABLE_AGENT_TYPES`); stored runners keep theirs and fail at the worker if it's left out.
- Harness name, description, logo, default, test-only flag, custom endpoint rank and telemetry provider come from the plugins (`agentCatalog.ts`, `AgentRegistry.getTelemetryProvider`). The default harness is `defaultAgent` in the build config.
- Inbound webhooks are an integration capability: each tracker's and the custom webhook's `WebhookReceiver` (signature, parsing, retry headers, reading an event into an issue, comment or task) lives in its package with its tests. The backend has one route, `/api/webhooks/:provider/:configId`, and one handler; an unknown address answers 404, a payload the sender has to fix 400.
- Repositories are an integration capability: a code host's `RepositoryHost` (git username, parsing and checking a repository, opening a pull request, reading its outcome and review) lives in its package. The worker only clones and pushes, with the username the job names, and asks the platform to open the pull request (`POST /api/jobs/:jobId/pull-request`). The platform picks the host by the space's code-host connection, not the URL. Setup connects the build's code host.
- Chat is an integration capability: a `ChatProvider` (the chat SDK adapter and its handlers, direct messages, finding an account by email, mention syntax) lives in the integration's package; `chat-slack` merged into `integration-slack`. The bot, the task mirror, thread inbound, account links (`user_chat_identities`), DMs, status and the webhook route work for any chat service.
- "Test connection" calls the plugin's optional `checkConnection`; the legacy `PMIntegration` classes, the per-space integration config endpoints and their DAO are gone.
- Harness settings are fields: a plugin declares `settings` (key, label, string or select, the env vars the worker sets, the provider default that fills it) and `harnessConfigEditor`, and the catalog carries them. `AgentType` is an open string checked against the catalog. One backend normalizer, one frontend form, reader and builder, and one worker step replace the per-harness config types, normalizers, form fields and endpoint environments. Configs from before the v1 format are no longer read. Both kinds of plugin share the field type, `PluginField`.
- Both kinds of plugin share `PluginManifest` (id, label, description). Each integration package has a `src/manifest.ts` its backend and frontend entries spread; the API sends it as is. Icons are frontend plugin components. The connection screen goes by the manifest: config form when it has `configFields`, token section when it has `credentialUse`, webhook section when it has `webhookProvider` (the tracker one when the frontend plugin has `trackerWebhook`), install section instead of a name prompt when it has `AuthSetupSection`.

## Learned so far

- Plugin data that nothing reads goes stale, and then the UI overrides it by id: GitHub declared connection fields the screen hid, Shortcut declared an API key but was treated as a token. Make each manifest field drive something, and test the screen with made-up plugins rather than real ids.
- A generic registry wasn't worth it: the agent and integration registries share three lines and differ in what an unknown id does.
- `category` names the slot a connection fills for a space (primary code host, primary tracker); that is a real concept and stays. Capabilities sit beside it.

## Harnesses

### H3. Worker internals into the plugins

- Env passthrough becomes a plugin field. It replaces the per-harness groups in `agent-core/src/agentEnvironment.ts`.
- The OpenCode usage parsers move from `agent-core` into `agent-opencode`. The frontend log parsers for OpenCode and the Responses format go behind a log format the manifest names.
- The multi-agent, lambda, docker and ECS worker Dockerfiles are composed from the plugins' `Dockerfile.fragment`s.

### H4. Sign-in as a capability

- The manifest declares sign-in methods:
  - API keys per provider (the existing `providers` bindings)
  - interactive logins (device code, OAuth), each with the credential files to cache
- The platform gets one generic login flow, replacing:
  - `CodexLoginService` and `AgentLoginJobService` with one login job
  - the `codex_login` secret purpose with one login secret purpose that carries the harness id
  - `codexAuthCacheRoute` with one credential cache route, keyed by harness
  - the Codex credential bindings in the invokers (`KubernetesInvoker`, `DockerInvoker`, `WorkerInvokerFactory`, `CredentialRequirementsService`) with generic ones
  - `CallbackClient.sendCodexAuthCache` in the worker with a generic call
  - the codex `if` branches in `ModelSection.tsx` and `RunnerForm.tsx`, and the `codexAuth` reads in `runnerReadiness.ts` and `runnerSummary.ts`, now driven by the declared methods
  - the `codexAuth` branch in the backend's `clanker-config/index.ts` (with `codexAuth.ts`) and the frontend's `buildConfig.ts`, `readConfig.ts` and `codexFields.tsx`, and `codexAuth` on `ClankerAgentConfig`
  - `codex-device-auth-card.tsx`, `chatgpt-login-card.tsx` and the Codex parts of `SecretsPage.tsx` with a generic device-code or OAuth card; a plugin slot only if a harness really needs its own
- The Codex config re-exports in `apps/viberator/src/config/clankerConfig.ts` are removed.

## Integrations

### I1 leftovers

- Stub manifests (GitLab, Bitbucket, Linear, Monday) still declare aspirational `supports` and config fields; fix them when each is built.

### I2 leftovers

- `IntegrationRegistry.getWebhookProvider` and the manifest's `webhookProvider` equal the integration id everywhere; it could become a flag.

### I3 leftovers

- GitHub Enterprise: the API address follows `GITHUB_API_URL`, but the GitHub host's URL patterns (repository addresses, pull request addresses, clone URLs) still only recognise github.com.
- The frontend still assumes github.com in a few places: the setup screen's token help (kept on purpose while GitHub is the only code host), placeholders, and `run-facts.tsx`, `run-record-panel.tsx`, `run-activity.tsx` and `build-pull-request-panel.tsx`, which read a bare `owner/repo` as github.com or strip `github.com/` for display.

### I4 leftovers

- Slack is still set up only by environment variables (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`); its connection row doesn't hold the token. Moving that into the connection would let the UI set it up.
