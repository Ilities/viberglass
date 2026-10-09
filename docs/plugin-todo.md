# Plugins: what's left

Steps to make harnesses and integrations plugins chosen by build config ([ADR 0015](adr/0015-harnesses-and-integrations-are-plugins.md)). Collected 2026-10-09. Each step ships on its own and keeps current behaviour. Delete steps as they're done, and this file with the last one.

The target for every step: nothing outside a plugin's package names it, except test fixtures.

## Done

- `viberglass.plugins.json` lists the plugins in a build. `npm run generate:plugins` writes the registrations for the worker, backend and frontend, and each app's plugin dependencies. The worker build, the frontend and backend build scripts, amplify, the Dockerfiles, the catalogs and the generated worker Dockerfiles read it. The scaffolding scripts add new plugins to it.
- `TicketSystem` is an open string, and the database no longer constrains harness, ticket system or webhook provider ids.
- New runners can only use harnesses in the build (`AVAILABLE_AGENT_TYPES`); stored runners keep theirs and fail at the worker if it's left out.
- Harness name, description, logo, default, test-only flag, custom endpoint rank and telemetry provider come from the plugins (`agentCatalog.ts`, `AgentRegistry.getTelemetryProvider`). The default harness is `defaultAgent` in the build config.

## Harnesses

### H1 leftovers

- A shared kernel for both kinds of plugin: the base manifest type, the settings field type (moved from `IntegrationFieldDefinition`, which exists in both `integration-core` and `types`), and a generic registry. Do it with I1, when the integration manifest gains the same fields.

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

### I1. UI data from the manifest

- Manifest gains `description`, `icon`, the credential use text and `capabilities`.
- These derive from the manifest:
  - `INTEGRATION_DESCRIPTIONS` and `INTEGRATION_ICONS` in `packages/types/src/integration.ts`
  - `INTEGRATION_ICON_COMPONENTS` in `integration-visuals.tsx`
  - `formatTicketSystem`
  - `TRACKER_NAME` in `thread-entries.tsx`
  - `TOKEN_USE` and `TOKEN_CONNECTIONS`
  - `INTEGRATION_CAPABILITIES` in `capabilities.ts`
- `IntegrationDetailPage`'s `isGithub`, `isJira`, `isShortcut`, `isCustom` and `isSlack` flags become capability checks. The custom inbound webhook section becomes a frontend plugin slot, like `AuthSetupSection`.
- The integration category labels come from capabilities.
- Copy naming specific trackers ("GitHub, Jira or Shortcut") lists the included trackers instead.

### I2. Inbound webhooks capability

- `integration-core` gains the webhook interface:
  - detection headers or body keys
  - signature header and verification
  - retry headers
  - payload parsing
  - mapping events to inbound actions
- The backend's `webhooks/providers/*`, `inbound-processors/*` and the per-tracker payload helpers in `services/trackers/` move into the packages.
- One `/webhooks/:provider` route replaces the per-provider route files.
- The registry replaces:
  - the sniffing and `setupHeaderMappings` switch in `ProviderRegistry`
  - the policy classes in `ProviderWebhookPolicyResolver` and `IntegrationWebhookProviderPolicyResolver`
  - the `toProviderType` switches in `WebhookService` and `WebhookRetryService`
  - the instantiation in `webhookServiceFactory` and `InboundEventProcessorResolver`
  - the provider list in `management.routes.ts`
- The webhook provider unions in `database.ts`, the webhook DAOs, `WebhookProvider.ts`, `webhookServiceTypes.ts` and `TrackerIssueInbound.ts` become strings.

### I3. Repository capability

- `integration-core` gains the repository interface:
  - git auth for the worker
  - opening a pull request
  - reading its outcome and review comments
  - checking a repository during setup
- GitHub implements it, with code moved from:
  - the worker's `GitService` and `scm/`
  - the backend's `pull-request-outcomes/` and `pull-request-reviews/`
  - setup's `GitHubRepositoryChecker`
- Setup asks for a repository integration instead of `github`.

### I4. Chat capability

- `chat-slack` registers as an integration with the chat capability.
- `chat/index.ts` wires the included chat plugins from the registry.
- The `system === "slack"` checks and the `/slack/status` route become capability-driven.
