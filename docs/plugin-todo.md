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
- Both kinds of plugin share `PluginManifest` (id, label, description). Each integration package has a `src/manifest.ts` its backend and frontend entries spread; the API sends it as is. Icons are frontend plugin components. The connection screen goes by the manifest: config form when it has `configFields`, token section when it has `credentialUse`, webhook section when it has `webhookProvider` (the tracker one when the frontend plugin has `trackerWebhook`), install section instead of a name prompt when it has `AuthSetupSection`.

## Learned so far

- Plugin data that nothing reads goes stale, and then the UI overrides it by id: GitHub declared connection fields the screen hid, Shortcut declared an API key but was treated as a token. Make each manifest field drive something, and test the screen with made-up plugins rather than real ids.
- A generic registry wasn't worth it: the agent and integration registries share three lines and differ in what an unknown id does.
- `category` names the slot a connection fills for a space (primary code host, primary tracker); that is a real concept and stays. Capabilities sit beside it.

## Harnesses

### H2. Settings as fields

- `AgentType` becomes an open string checked against the catalog, and `SUPPORTED_AGENT_TYPES` goes away. It can't before this step: the per-harness config types tell harnesses apart by `type`.
- Each harness declares its settings (model, endpoint and so on) as fields.
- One generic form, reader, builder and normalizer replace:
  - the per-agent config types in `clankerConfig.ts`
  - the backend's `clanker-config/agents/*`, the `normalizeAgent` chain in `clanker-config/index.ts` and `legacyMapper.ts`
  - the frontend's `config/types.ts` per-agent fields, `buildConfig.ts`, `readConfig.ts`, `normalizers.ts`, `modelKey.ts` and `agents/*Fields.tsx`
- Harness config file references and templates (`harnessReferences.ts`, `instructionFiles.ts`) move next to `harnessConfigPatterns` in the plugin.

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
  - the codex `if` branches in `runnerReadiness.ts`, `runnerSummary.ts`, `ModelSection.tsx` and `RunnerForm.tsx`, now driven by the declared methods
  - `codex-device-auth-card.tsx`, `chatgpt-login-card.tsx` and the Codex parts of `SecretsPage.tsx` with a generic device-code or OAuth card; a plugin slot only if a harness really needs its own
- The Codex config re-exports in `apps/viberator/src/config/clankerConfig.ts` are removed.

## Integrations

### I1 leftovers

- Stub manifests (GitLab, Bitbucket, Linear, Monday) still declare aspirational `supports` and config fields; fix them when each is built.
- The per-space integration config endpoints in `api/routes/projects.ts` (`/:projectId/integrations/:integrationId`) have no callers; remove them, and with them the legacy `PMIntegration` config fields (GitHub's owner and repo, Slack's channel).

### I2 leftovers

- The legacy `PMIntegration.handleWebhook` and `registerWebhook` in the integration classes duplicate the receivers' parsing and aren't called by the webhook pipeline; remove them with the per-space endpoints above.
- `IntegrationRegistry.getWebhookProvider` and the manifest's `webhookProvider` equal the integration id everywhere; it could become a flag.

### I3 leftovers

- GitHub Enterprise: the API address follows `GITHUB_API_URL`, but the GitHub host's URL patterns (repository addresses, pull request addresses, clone URLs) still only recognise github.com.
- The frontend still assumes github.com in a few places: the setup screen's token help (kept on purpose while GitHub is the only code host), placeholders, and `run-facts.tsx`, `run-record-panel.tsx`, `run-activity.tsx` and `build-pull-request-panel.tsx`, which read a bare `owner/repo` as github.com or strip `github.com/` for display.
- `api/server.ts` logs a `GITHUB_TOKEN` status line at startup; the worker no longer reads `GITHUB_TOKEN`, `GITLAB_*` or `BITBUCKET_*` from its environment, so the CLI help in `cli-handler.ts` that suggests `-e GITHUB_TOKEN` is out of date.
- `GitHubIntegration.createPullRequest` and `linkPullRequestToIssue` are unused copies of what the host does; remove them with the other legacy `PMIntegration` methods.

### I4. Chat capability

- `chat-slack` registers as an integration with the chat capability.
- `chat/index.ts` wires the included chat plugins from the registry.
- The connection screen still asks `getSlackBotStatus` whether an app-installed connection is connected; the plugin should say how.
- The `system === "slack"` checks and the `/slack/status` route become capability-driven.
