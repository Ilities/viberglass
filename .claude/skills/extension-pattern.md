# Extension Package Pattern

Use this pattern whenever adding a new provider, adapter, or integration that must be **swappable without touching shared infrastructure**.

---

## When to Use It

Apply this pattern when:
- The same capability exists in multiple flavours (Slack, Discord; GitHub, GitLab; Claude Code, Qwen)
- The implementation depends on backend services but must stay decoupled from them
- You want adding a second implementation to be a matter of creating a new package, not modifying shared code

Do **not** apply it for one-off adapters that will never have a second implementation — it adds unnecessary indirection.

---

## The Three Layers

```
packages/<extension-name>/        ← Layer 1: the extension package
  src/
    types.ts                      ← Services interface (imports domain types from @viberglass/types)
    index.ts                      ← registerXyzExtension(host, services)
    handlers/ or providers/       ← Extension-specific logic

apps/platform-backend/src/
  <domain>/index.ts               ← Layer 2: composition root — wires services, calls register*
  <domain>/infrastructure/        ← Layer 3: generic infrastructure (DAO, bridge, map, registry)
```

**Layer 1 — the package** knows nothing about the backend's internal classes. It owns:
- A `*Services` interface describing every backend capability it needs (narrow, method-per-operation)
- All extension-specific logic (event handling, API calls, payload parsing)
- An entry-point `register*(host, services)` function
- Domain types are **imported from `@viberglass/types`**, never redefined locally

**Layer 2 — the composition root** (`domain/index.ts`) knows both sides. It:
- Instantiates backend classes (DAOs, services)
- Wraps them into the `*Services` shape, adapting signatures where needed
- Calls `register*()` once

**Layer 3 — generic infrastructure** owns behaviour that is the same regardless of which extension is active. It never mentions a specific provider by name.

---

## Services Interface Rules

The `*Services` interface in the package must be:

1. **Narrow** — one method per operation, no leaking of internal collaborators. `createTicket(params)` not `ticketDAO`.
2. **Typed with `@viberglass/types`** — domain types (`AgentSessionMode`, `TicketSeverity`, etc.) belong in the shared types package. Import them; never redefine them. If a type the extension needs does not yet exist in `@viberglass/types`, move it there first.
3. **Void-returning where the caller doesn't use the result** — the composition root wraps accordingly.
4. **Named for intent** — `launchSession()` not `agentSessionLaunchService.launch()`.

```typescript
// a package's types.ts
import type { AgentSessionMode } from "@viberglass/types";  // ← import, never redefine
import type { Thread } from "chat";

export interface ExampleHandlerServices {
  listProjects(): Promise<Array<{ id: string; name: string }>>;
  launchSession(params: {
    ticketId: string;
    clankerId: string;
    mode: AgentSessionMode;           // ← proper shared type
    initialMessage: string;
  }): Promise<{ session: { id: string } }>;
  replyToSession(sessionId: string, text: string): Promise<void>;
  // ...
}
```

The package lists `@viberglass/types` as a peer dependency.

---

## Canonical Example — chat (Slack)

**Contract:** `packages/integration-core/src/backend/chat/` — `ChatProvider` (adapter, handlers, DMs, account lookup, mention syntax) and `ChatHandlerServices` (what the platform does for the handlers, keyed by `chatUserId`).

**Package:** `packages/integrations/integration-slack` — `SlackChatProvider` on the plugin's `chat`, with the Slack handlers under `src/backend/chat/`.

**Generic infrastructure (backend):**
- `chat/ChatBotRuntime.ts` — one adapter per chat service whose connection holds its credentials (passed in through `provider.configure`); rebuilt when a connection changes
- `chat/index.ts` — builds `ChatHandlerServices` per service and calls `provider.registerHandlers`
- `chat/TaskChatMirror.ts`, `TaskThreadInbound.ts`, `ticketThreadMap.ts` — work with any `Thread`; nothing names Slack
- `persistence/user/ChatIdentityDAO.ts` — linked accounts by adapter name

**Adding Discord:** an integration package whose plugin sets `chat` to a `ChatProvider`. No changes to the bot, mirror, DAO or routes.

## Applying to Other Domains

### Integrations (GitHub, GitLab, Shortcut…)

**Extension packages:** `packages/integrations/integration-<name>`, listed in `viberglass.plugins.json`.
- `src/manifest.ts` — plain data (`IntegrationManifest` from `@viberglass/types`) that the backend and frontend entries both spread: label, description, category, config fields, `credentialUse`, `receivesWebhooks`.
- `src/backend/plugin.ts` — the manifest plus capabilities: `checkConnection`, `createCommenter` for trackers, `webhook` (a `WebhookReceiver`) when it receives webhooks, `repository` (a `RepositoryHost`) for a code host, `chat` (a `ChatProvider`) for a chat service.
- `src/frontend/plugin.ts` — the manifest plus `Icon` and optional slots (`trackerWebhook`, `AuthSetupSection`).

**Generic infrastructure:** the webhook pipeline (`webhooks/WebhookService.ts`, `InboundEventHandler.ts`, one `/api/webhooks/:provider/:configId` route) finds the receiver by provider and acts on what it reads: an issue, a comment, a task, or ignored. It never names a provider. The same goes for repositories: the platform finds the space's code host by its connection and calls its `RepositoryHost`; the worker only runs git, with the username the job carries, and asks the platform to open pull requests.

**Composition root:** generated from the build config (`npm run generate:plugins`); nothing to register by hand.

### Agents (claude-code, qwen-cli, codex…)

Agents are plugin packages under `packages/agents/`, listed in `viberglass.plugins.json`. An agent id is an open string checked against the generated agent catalog. A harness's settings are declared as fields on its plugin (`settings`), and the runner form, the backend normalizer and the worker handle them generically.

**Adding Agent-X:** run `npm run new:agent x` (it creates `packages/agents/agent-x`); see `packages/agents/README.md`.

### Credential storage

Credential providers live in the backend, not in packages, but keep the same split: the `CredentialProvider` interface (`apps/platform-backend/src/credentials/CredentialProvider.ts`: `get`, `put`, `delete` per tenant, `isAvailable`), one class per backend in `credentials/providers/` (environment, file, AWS SSM), and `CredentialProviderFactory` choosing them from configuration in a fixed fallback order. A new backend is a new provider class plus a config switch in the factory.

---

## Monorepo Setup Checklist

When creating a new extension package:

For a harness or an integration, use `npm run new:agent <name>` or `npm run new:integration <name>`: they scaffold the package, add it to `viberglass.plugins.json` and run `npm run generate:plugins`, which adds the dependency to the consuming apps. `packages/agents/*` and `packages/integrations/*` are already in the root `workspaces`. Then run `npm install` and build the package.

For any other extension package:

- [ ] `packages/<name>/package.json` — name `@viberglass/<name>`, declare `@viberglass/types` and host SDK as peer dependencies
- [ ] `packages/<name>/tsconfig.json` — copy from `packages/types/tsconfig.json`
- [ ] Add `"packages/<name>"` to root `package.json` `workspaces` array
- [ ] Add `"@viberglass/<name>": "*"` to the consuming app's `package.json` `dependencies`
- [ ] Run `npm install` at monorepo root
- [ ] Build package before type-checking backend: `npm run build -w @viberglass/<name>`

---

## Anti-patterns to Avoid

| Anti-pattern | Why it's wrong | Fix |
|---|---|---|
| `switch (providerName) { case "slack": ... }` in shared code | Every new provider requires modifying core | Move to provider-declared metadata |
| Importing backend DAOs/services directly inside the package | Creates app→package coupling | Inject via `*Services` interface |
| Redefining domain types locally in the package (`type SessionMode = "research" \| ...`) | Types drift, structural compatibility is fragile | Move type to `@viberglass/types`, import it |
| Naming generic infrastructure after a specific provider (`SlackSessionThreadDAO`) | Implies only one provider can ever exist | Remove provider name from generic layer |
| Leaking `as` casts at the wiring point to bridge type mismatches | Bypasses type safety | Align types via `@viberglass/types`; wrap return values explicitly |
| One factory function that hard-codes all provider instantiations | Needs editing every time a provider is added | Iterate over a declared registry instead |
