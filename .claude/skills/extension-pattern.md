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
// packages/chat-slack/src/types.ts
import type { AgentSessionMode } from "@viberglass/types";  // ← import, never redefine
import type { Thread } from "chat";

export interface SlackHandlerServices {
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

## Canonical Example — chat-slack

**Package:** `packages/chat-slack`
- `src/types.ts` — `SlackHandlerServices` importing domain types from `@viberglass/types`
- `src/handlers/` — 5 Slack-specific handlers (slash command, modal, thread reply, mention, approval)
- `src/index.ts` — `registerSlackHandlers(bot: Chat, services: SlackHandlerServices): void`

**Generic infrastructure (backend):**
- `persistence/chat/ChatSessionThreadDAO.ts` — stores `adapter_name` column, no "slack" anywhere
- `chat/sessionThreadMap.ts` — `linkSessionThread(sessionId, thread, adapterName)`
- `chat/ChatSessionBridgeService.ts` — polls and posts events; works with any `Thread`

**Composition root:** `chat/index.ts`
```typescript
const slackServices: SlackHandlerServices = {
  listProjects: () => projectDAO.listProjects(),
  launchSession: (params) => launchService.launch(params),  // types align — both use AgentSessionMode
  linkSessionThread: (sessionId, thread) => linkSessionThread(sessionId, thread, "slack"),
  replyToSession: async (sessionId, text) => { await interactionService.reply(sessionId, text); },
  // ...
};
registerSlackHandlers(bot, slackServices);
```

**Adding Discord:** create `packages/chat-discord`, implement `SlackHandlerServices` (rename to `ChatHandlerServices` if sharing), add one `registerDiscordHandlers(bot, discordServices)` call to `chat/index.ts`. No changes to DAO, bridge, or session map.

---

## Applying to Other Domains

### Integrations (GitHub, GitLab, Shortcut…)

**Extension packages:** `packages/integration-github`, `packages/integration-gitlab`, etc.
- `types.ts` — `IntegrationProviderServices` interface; domain ticket/webhook types from `@viberglass/types`
- `index.ts` — `registerGitHubProvider(registry: ProviderRegistry, services: IntegrationProviderServices)`

**Generic infrastructure to preserve:**
- `webhooks/ProviderRegistry.ts` — already generic; `register(provider)` is the extension point
- `webhooks/InboundEventProcessorResolver.ts` — already generic

**What to remove:** The `switch(providerName)` blocks in `WebhookService.ts`, `WebhookRetryService.ts`, and `ProviderRegistry.setupHeaderMappings()`. Replace by adding `detectionHeaders: string[]` to the `WebhookProvider` base class so routing is data-driven — each provider declares its own headers.

**Composition root:** `webhooks/webhookServiceFactory.ts` — one `register()` call per provider bundle.

### Agents (claude-code, qwen-cli, codex…)

Agents are config-driven rather than code-driven. A registry object is more appropriate than full packages.

**Build:**
- `clanker-config/AgentConfigRegistry.ts` — maps `AgentType → { normalizer, credentialChecker? }`
- Move `AgentSessionMode`, `AgentType`, `SUPPORTED_AGENT_TYPES` into `@viberglass/types` if not already there

**Remove:** The `if (agent.type === "codex") … if (agent.type === "qwen-cli") …` chain in `clanker-config/index.ts`. Replace with `agentConfigRegistry.normalize(agent.type, agent)`.

**Adding Agent-X:**
1. Add `"agent-x"` to `SUPPORTED_AGENT_TYPES` in `@viberglass/types`
2. Optionally add a normalizer in `clanker-config/agents/agentX.ts` and register it
3. Add worker image catalog entry in `workerImageCatalog.json`
4. Write a DB migration updating the agent CHECK constraint

### Secret Management

Secret providers (AWS SSM, Vault, environment variables) follow the same structure:
- `SecretProviderServices` interface in a `packages/secrets-*` package: `get(key): Promise<string | null>`, `set(key, value): Promise<void>`
- Composition root wires the correct provider based on `process.env.SECRET_BACKEND`

---

## Monorepo Setup Checklist

When creating a new extension package:

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
