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
- Worker internals are in the plugins. Plugins name the env vars their CLI reads (`agentEnv`, besides keys, endpoints and settings), and the agent allowlist is what the registered harnesses name. A harness's output normalizer and usage parsers live in its package (`createOutputNormalizer`); agent-core keeps the stream-json one most harnesses share, and the frontend only reads the normalized `item` events. `npm run generate:dockerfiles` composes the per-harness, multi-agent, ECS and Lambda images from each harness's `Dockerfile.fragment` and `Dockerfile.lambda.fragment`; the local Docker image is the multi-agent one.
- Sign-in is a harness capability. A plugin declares `signInMethods` (a device code is the only kind so far) and a runner stores its choice as `agent.signIn`. One login job, one `agent_login` secret purpose, one upload route (`POST /api/jobs/:jobId/agent-login`) and one device-code card serve every harness; the runner form, readiness and summary go by the declared method. Each runner keeps its own login; the shared login cache and the per-run sign-in mode are gone.
- Leftovers: badge colours come from the log source's name; the integration manifests lost `supports` and `authTypes`, which nothing read, and the stubs their config fields; `receivesWebhooks` replaced `webhookProvider`, so deliveries route under the integration's id; GitHub Enterprise repository, clone and pull request addresses follow the host of `GITHUB_API_URL`; the frontend shows any host's repository and pull request addresses by their path. `pluginIdsStayInPackages.test.ts` fails when a plugin id shows up outside its package, tests and migrations.
- Both kinds of plugin share `PluginManifest` (id, label, description). Each integration package has a `src/manifest.ts` its backend and frontend entries spread; the API sends it as is. Icons are frontend plugin components. The connection screen goes by the manifest: config form when it has `configFields`, token section when it has `credentialUse`, webhook section when it `receivesWebhooks` (the tracker one when the frontend plugin has `trackerWebhook`), install section instead of a name prompt when it has `AuthSetupSection`.

## Learned so far

- Plugin data that nothing reads goes stale, and then the UI overrides it by id: GitHub declared connection fields the screen hid, Shortcut declared an API key but was treated as a token. Make each manifest field drive something, and test the screen with made-up plugins rather than real ids.
- A generic registry wasn't worth it: the agent and integration registries share three lines and differ in what an unknown id does.
- `category` names the slot a connection fills for a space (primary code host, primary tracker); that is a real concept and stays. Capabilities sit beside it.

## Integrations

### I4 leftovers

- Slack is still set up only by environment variables (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`); its connection row doesn't hold the token. Moving that into the connection would let the UI set it up.
