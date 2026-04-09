# Agent Plugin Architecture — Implementation Plan

## Goal

Refactor the current monolithic agent system (8 hardcoded agents in `apps/viberator/src/agents/`) into a plugin architecture where each agent lives in its own workspace package and registers itself with a central registry via a typed descriptor.

## Design decisions (pre-settled)

1. **Registration style:** explicit static import list (Option A) — typed, tree-shakeable, single-file touch to add a new agent.
2. **Config typing:** per-plugin config types owned by the plugin package (no central discriminated union).
3. **Docker:** each plugin ships a `Dockerfile.fragment`; `infra/workers/docker/agents/*.Dockerfile` are composed from fragments.
4. **Event mappers:** each plugin may expose its own ACP event mapper; the core falls back to the generic one when absent.
5. **Worker image catalog:** `packages/types/src/workerImageCatalog.json` becomes **generated** from plugin descriptors at build time.

## Target layout

```
packages/
├── agent-core/                          ← NEW: shared framework
│   ├── src/
│   │   ├── BaseAgent.ts
│   │   ├── AgentPlugin.ts               (IAgentPlugin + AgentAuthLifecycle + AgentEndpointEnvironment)
│   │   ├── AgentRegistry.ts
│   │   ├── AcpExecutor.ts
│   │   ├── acpEventMapper.ts            (generic/default)
│   │   ├── acpEventMapperTypes.ts       (AcpEventMapper interface)
│   │   ├── agentStreamNormalizer.ts
│   │   ├── AcpClient.ts
│   │   ├── noop/
│   │   │   ├── NoopAgentAuthLifecycle.ts
│   │   │   └── NoopAgentEndpointEnvironment.ts
│   │   └── types.ts                     (BaseAgentConfig, ExecutionContext, ExecutionResult, AgentCLIResult)
│   └── package.json                     ("@viberglass/agent-core")
│
├── agents/
│   ├── agent-claude-code/
│   │   ├── src/
│   │   │   ├── ClaudeCodeAgent.ts
│   │   │   ├── config.ts                (ClaudeCodeConfig)
│   │   │   ├── plugin.ts                (exports default AgentPlugin<ClaudeCodeConfig>)
│   │   │   ├── eventMapper.ts           (optional — omit if generic suffices)
│   │   │   └── index.ts                 (re-exports plugin, agent, config)
│   │   ├── test/ClaudeCodeAgent.test.ts
│   │   ├── Dockerfile.fragment
│   │   └── package.json                 ("@viberglass/agent-claude-code")
│   ├── agent-codex/                     (+ owns CodexAuthManager, CodexAgentAuthLifecycle)
│   ├── agent-qwen/                      (+ owns qwen endpoint resolution)
│   ├── agent-opencode/                  (+ owns $HOME/.opencode materialization hook)
│   ├── agent-kimi/
│   ├── agent-mistral-vibe/
│   ├── agent-gemini/
│   └── agent-pi/                        (+ owns piEventMapper)
│
└── types/                               ← existing; workerImageCatalog.json becomes generated

apps/viberator/
└── src/
    ├── agents/
    │   ├── registerPlugins.ts           (NEW: explicit import + registration)
    │   └── index.ts                     (re-exports buildAgentRegistry)
    ├── orchestrator/
    │   └── AgentOrchestrator.ts         (uses registry; executor moved to core)
    └── workers/runtime/
        ├── InstructionFileManager.ts    (uses registry metadata)
        ├── SessionStateManager.ts       (uses registry metadata)
        ├── ClankerAgentAuthLifecycleFactory.ts       (uses registry.authLifecycle)
        └── ClankerAgentEndpointEnvironmentFactory.ts (uses registry.endpointEnvironment)
```

---

## Core contracts

### `BaseAgentConfig` (in `@viberglass/agent-core`)

```ts
export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxDiskSpaceMB: number;
  maxNetworkRequests: number;
}

export interface BaseAgentConfig extends Record<string, unknown> {
  name: string;                // plugin id — matches AgentPlugin.id
  apiKey?: string;
  endpoint?: string;
  capabilities: string[];
  costPerExecution: number;
  averageSuccessRate: number;
  executionTimeLimit: number;
  resourceLimits: ResourceLimits;
}
```

Plugins extend it:
```ts
// @viberglass/agent-pi/src/config.ts
import type { BaseAgentConfig } from "@viberglass/agent-core";
export interface PiConfig extends BaseAgentConfig {
  name: "pi";
  apiKey: string;
}
```

### `AgentPlugin` descriptor

```ts
export interface AgentPlugin<C extends BaseAgentConfig = BaseAgentConfig> {
  readonly id: string;                   // e.g. "pi"
  readonly displayName: string;          // e.g. "Pi Coding Agent"

  // Factory — replaces AgentFactory switch
  create(config: C, logger: Logger): BaseAgent;

  // Defaults — replaces DEFAULT_AGENT_CONFIGS entry
  readonly defaultConfig: Omit<C, "name">;

  // Env aliases — replaces AGENT_ENV_ALIASES entry
  readonly envAliases?: {
    apiKey?: string[];
    endpoint?: string[];
  };

  // HOME subdir for session state — replaces AGENT_STATE_DIRS entry
  readonly stateDir?: string;            // e.g. ".pi"

  // Harness config patterns — replaces HARNESS_CONFIG_PATTERNS
  readonly harnessConfigPatterns?: string[];

  // Optional side-effectful materialization (OpenCode $HOME, etc.)
  readonly materializeHarnessConfig?: (args: {
    configRelativePath: string;
    absoluteSourcePath: string;
    contents: string;
    homeDir: string;
  }) => Promise<void>;

  // Optional custom ACP event mapper — fall back to generic if absent
  readonly acpEventMapper?: AcpEventMapper;

  // Optional per-agent auth lifecycle (Codex device auth etc.)
  readonly authLifecycle?: (ctx: AgentRuntimeContext) => AgentAuthLifecycle;

  // Optional per-agent endpoint environment (OpenCode/Qwen)
  readonly endpointEnvironment?: (ctx: AgentRuntimeContext) => AgentEndpointEnvironment;

  // Docker image metadata — feeds generated workerImageCatalog.json
  readonly docker: {
    variant: string;                      // "pi"
    repositoryName: string;               // "viberator-worker-pi"
    scriptImageName: string;              // "worker-pi"
    supportedAgents: string[];            // ["pi"]
    defaultForAgents: string[];           // ["pi"]
    fragmentPath: string;                 // resolved from package root
  };
}
```

### `AgentRegistry`

```ts
export class AgentRegistry {
  private plugins = new Map<string, AgentPlugin>();

  register(plugin: AgentPlugin): this {
    if (this.plugins.has(plugin.id))
      throw new Error(`Duplicate agent plugin: ${plugin.id}`);
    this.plugins.set(plugin.id, plugin);
    return this;
  }

  get(id: string): AgentPlugin {
    const p = this.plugins.get(id);
    if (!p) throw new Error(`Unknown agent: ${id}`);
    return p;
  }

  tryGet(id: string): AgentPlugin | undefined { return this.plugins.get(id); }

  list(): AgentPlugin[] { return [...this.plugins.values()]; }

  createAgent(config: BaseAgentConfig, logger: Logger): BaseAgent {
    return this.get(config.name).create(config, logger);
  }

  getAcpEventMapper(id: string): AcpEventMapper {
    return this.tryGet(id)?.acpEventMapper ?? defaultAcpEventMapper;
  }

  getDefaultConfigs(): Record<string, unknown> {
    return Object.fromEntries(
      this.list().map(p => [p.id, { name: p.id, ...p.defaultConfig }])
    );
  }

  getEnvAliases(): Record<string, { apiKey?: string[]; endpoint?: string[] }> {
    return Object.fromEntries(
      this.list()
        .filter(p => p.envAliases)
        .map(p => [p.id, p.envAliases!])
    );
  }

  getStateDirs(): Record<string, string> {
    return Object.fromEntries(
      this.list()
        .filter(p => p.stateDir)
        .map(p => [p.id, p.stateDir!])
    );
  }

  getHarnessConfigPatterns(): string[] {
    return this.list().flatMap(p => p.harnessConfigPatterns ?? []);
  }
}
```

### Registration (Option A — explicit)

```ts
// apps/viberator/src/agents/registerPlugins.ts
import { AgentRegistry } from "@viberglass/agent-core";
import claudeCodePlugin from "@viberglass/agent-claude-code";
import codexPlugin from "@viberglass/agent-codex";
import qwenPlugin from "@viberglass/agent-qwen";
import openCodePlugin from "@viberglass/agent-opencode";
import kimiPlugin from "@viberglass/agent-kimi";
import mistralVibePlugin from "@viberglass/agent-mistral-vibe";
import geminiPlugin from "@viberglass/agent-gemini";
import piPlugin from "@viberglass/agent-pi";

export function buildAgentRegistry(): AgentRegistry {
  return new AgentRegistry()
    .register(claudeCodePlugin)
    .register(codexPlugin)
    .register(qwenPlugin)
    .register(openCodePlugin)
    .register(kimiPlugin)
    .register(mistralVibePlugin)
    .register(geminiPlugin)
    .register(piPlugin);
}

// Singleton for places that can't easily receive a reference
let _registry: AgentRegistry | null = null;
export function agentRegistry(): AgentRegistry {
  if (!_registry) _registry = buildAgentRegistry();
  return _registry;
}
```

---

## Stages

Every stage is a **single, reviewable PR** that leaves the tree green. Stages 3 and 4 repeat per agent.

### Stage 0 — Prep (baseline & safety net)

**Goal:** prove current behavior is captured by tests before touching anything.

Tasks:
1. Run full test suite; record baseline.
2. Identify coverage gaps for the 8 agents. Each should have at least `getAcpServerCommand()` + `getAcpEnvironment()` + `requiresApiKey()` smoke coverage. Add the missing ones for Claude Code and OpenCode if absent.
3. Add an integration-style test that boots `AgentFactory` for each agent name and asserts construction succeeds.
4. Snapshot the current `workerImageCatalog.json` under `packages/types/test/__snapshots__/` so Stage 6 can assert parity with generation.

Deliverable: green suite + new construction test + catalog snapshot. No source changes.

---

### Stage 1 — Create `@viberglass/agent-core`

**Goal:** a new workspace package containing all framework code; `apps/viberator` depends on it; behavior unchanged.

Tasks:
1. Create `packages/agent-core/` with:
   - `package.json` name `@viberglass/agent-core`, `main: dist/index.js`, `types: dist/index.d.ts`
   - `tsconfig.json` extending the repo base, emitting `dist/`
   - `tsup.config.ts` (match `packages/types` pattern)
2. Move (not copy) the following files from `apps/viberator/src/` into `packages/agent-core/src/`:
   - `agents/BaseAgent.ts`
   - `agents/agentStreamNormalizer.ts`
   - `acp/AcpClient.ts`
   - `acp/acpEventMapper.ts` (rename internally to `defaultAcpEventMapper` + define `AcpEventMapper` interface in `acpEventMapperTypes.ts`)
   - `orchestrator/AcpExecutor.ts`
3. Extract pure types from `apps/viberator/src/types/agents.ts`:
   - `ResourceLimits`, `BaseAgentConfig` → move to `agent-core/src/types.ts`
   - Keep each concrete agent's `*Config` interface in place **for now** (they move out in Stage 3)
4. Add new files:
   - `AgentPlugin.ts` — full `AgentPlugin` + `AcpEventMapper` + `AgentAuthLifecycle` + `AgentEndpointEnvironment` + `AgentRuntimeContext` interfaces
   - `AgentRegistry.ts` — registry class as specced above
   - `noop/NoopAgentAuthLifecycle.ts`, `noop/NoopAgentEndpointEnvironment.ts` — lifted from `workers/runtime/`
5. `apps/viberator/package.json`: add `"@viberglass/agent-core": "*"` dependency.
6. Rewrite imports in `apps/viberator` for all moved symbols to come from `@viberglass/agent-core`.
7. Add `npm run build -w @viberglass/agent-core` to root `build` script (before `apps/viberator`).
8. Run full suite; everything must still pass.

Deliverables:
- New `packages/agent-core` package
- `apps/viberator` still owns the 8 concrete agent classes and `AgentFactory`; the factory still holds its switch but imports `BaseAgent` from core
- Zero behavior change

Guardrails: no changes to `AgentFactory.ts` logic, runtime managers, or `DEFAULT_AGENT_CONFIGS` in this stage.

---

### Stage 2 — Metadata-driven dispatch inside `apps/viberator`

**Goal:** delete every hardcoded `{agent → X}` map and every `if (agent === "X")` branch, replacing with registry lookups. Concrete agents still live in `apps/viberator/src/agents/`, but they now register themselves via plugin descriptors built in-place.

Tasks:
1. For each of the 8 agents, create a sibling `ClaudeCodePlugin.ts` (etc.) next to the class, exporting `const claudeCodePlugin: AgentPlugin<ClaudeCodeConfig> = { … }`. The descriptor's `create()` calls the existing class constructor.
2. Populate each descriptor by pulling values out of the existing hardcoded maps:
   - `defaultConfig` ← corresponding entry in `config/AgentDefaults.ts::DEFAULT_AGENT_CONFIGS`
   - `envAliases` ← entry in `AGENT_ENV_ALIASES`
   - `stateDir` ← entry in `SessionStateManager::AGENT_STATE_DIRS`
   - `harnessConfigPatterns` ← per-agent subset of `InstructionFileManager::HARNESS_CONFIG_PATTERNS`
3. Create `apps/viberator/src/agents/registerPlugins.ts` that imports all 8 descriptors and registers them.
4. Replace `AgentFactory.createAgent()` body with `agentRegistry().createAgent(config, logger)`. Leave the class as a thin shim for now (callers keep compiling).
5. Delete:
   - `DEFAULT_AGENT_CONFIGS` map (replace call sites with `agentRegistry().getDefaultConfigs()`)
   - `AGENT_ENV_ALIASES` map (replace with `agentRegistry().getEnvAliases()`)
   - `AGENT_STATE_DIRS` constant in `SessionStateManager.ts` (replace with `agentRegistry().getStateDirs()`)
   - `HARNESS_CONFIG_PATTERNS` array in `InstructionFileManager.ts` (replace with `agentRegistry().getHarnessConfigPatterns()`)
6. `ClankerAgentAuthLifecycleFactory`:
   - Remove `if (agent !== "codex")` branch
   - Replace with `agentRegistry().get(agent).authLifecycle?.(ctx) ?? new NoopAgentAuthLifecycle()`
   - Move `CodexAuthManager` + `CodexAgentAuthLifecycle` into the Codex plugin descriptor's `authLifecycle` closure (file-level move, no logic change yet — they can stay in `workers/runtime/` and be referenced from the descriptor)
7. `ClankerAgentEndpointEnvironmentFactory`: same pattern — each agent that previously had a branch gets `endpointEnvironment` in its descriptor.
8. `InstructionFileManager`: the OpenCode-specific `$HOME/.opencode/opencode.json` materialization becomes `materializeHarnessConfig` on the OpenCode descriptor; core calls `plugin.materializeHarnessConfig?.(...)` after writing each matching file.
9. `orchestrator/AcpExecutor.ts` (now in core) gains an optional `mapper?: AcpEventMapper` parameter; `AgentOrchestrator` resolves it via `agentRegistry().getAcpEventMapper(config.name)`.
10. Wire the Pi event mapper: move `apps/viberator/src/acp/piEventMapper.ts` logic onto the Pi plugin descriptor as `acpEventMapper`. Delete the standalone file.
11. Run full suite; verify construction test from Stage 0 still passes for all 8 agents.

Deliverables:
- 0 hardcoded `switch (agent)` or `{agent: value}` maps in `apps/viberator/src`
- All 8 agents produce and are driven by descriptors
- `AgentFactory` is a one-line shim
- All tests green

Rollback plan: single revert restores the maps; descriptors are additive.

---

### Stage 3 — Pilot extraction: `@viberglass/agent-pi`

**Goal:** validate the full plugin extraction flow end-to-end on the simplest, most self-contained agent.

Tasks:
1. Create `packages/agents/agent-pi/` with:
   - `package.json` name `@viberglass/agent-pi`, depends on `@viberglass/agent-core`
   - `tsconfig.json`, `tsup.config.ts`
2. Move into `packages/agents/agent-pi/src/`:
   - `PiCodingAgent.ts`
   - `PiCodingAgent.test.ts` → `test/`
   - `PiConfig` interface → `config.ts`
   - Pi entry from descriptor pass of Stage 2 → `plugin.ts` (as default export)
   - Any Pi-specific event mapper logic → `eventMapper.ts`
3. Create `packages/agents/agent-pi/Dockerfile.fragment`:
   ```dockerfile
   # Fragment: Pi coding agent
   RUN npm install -g @mariozechner/pi-coding-agent pi-acp
   ENV AGENT_TYPE=pi
   ```
4. Package `index.ts` re-exports: `plugin` (default), `PiCodingAgent`, `PiConfig`.
5. Add `"@viberglass/agent-pi": "*"` to `apps/viberator/package.json`.
6. Update `apps/viberator/src/agents/registerPlugins.ts` to import from `@viberglass/agent-pi` instead of the local file.
7. Delete the local Pi files from `apps/viberator/src/agents/` and `apps/viberator/src/acp/`.
8. Update root `package.json` workspaces to include `packages/agents/*`.
9. Update `apps/viberator/src/types/agents.ts`: remove `PiConfig` from the union. Callers that typed on the union must now type on `BaseAgentConfig` — adjust any narrow references (expect only a handful).
10. Update `packages/types/src/workerImageCatalog.json`: leave the Pi entry as-is for now (catalog generation comes in Stage 6).
11. Run full suite + Pi integration tests. Verify Pi Dockerfile build still produces a working image (`docker build -f infra/workers/docker/agents/viberator-worker-pi.Dockerfile`).

Deliverables:
- First extracted plugin package
- Proof that descriptor + core contracts are sufficient
- Reference implementation for Stage 4

Risks & mitigations:
- **Build order:** ensure `agent-core` builds before `agent-pi` builds before `apps/viberator`. Root `build` script must enforce this.
- **`AgentConfig` union narrowing breaks:** audit all `AgentConfig` usages; most are already `BaseAgentConfig`-compatible. Worst case: introduce a `KnownAgentConfig` alias that only includes remaining non-extracted agents until Stage 4 is complete.

---

### Stage 4 — Extract remaining agents (7 × sub-stages)

**Goal:** repeat the Stage 3 recipe for each remaining agent, one PR per agent.

Order (simplest → hardest):
1. **`agent-mistral-vibe`** — self-contained, fallback CLI binary logic stays internal
2. **`agent-kimi`** — self-contained
3. **`agent-gemini`** — self-contained
4. **`agent-claude-code`** — self-contained (env vars, no runtime hooks)
5. **`agent-qwen`** — carries its endpoint-environment descriptor hook
6. **`agent-opencode`** — carries `materializeHarnessConfig` for `$HOME/.opencode/opencode.json`
7. **`agent-codex`** — last; carries `CodexAuthManager` + `CodexAgentAuthLifecycle` (hardest due to device-auth state)

For each sub-stage:
1. Scaffold `packages/agents/agent-<name>/`
2. Move agent class, config type, tests, Dockerfile fragment
3. Move any agent-owned runtime code (auth lifecycle, endpoint env, event mapper, materialize hook) into the plugin package
4. Export `plugin` default
5. Add dependency to `apps/viberator`
6. Update `registerPlugins.ts` import
7. Delete old files from `apps/viberator`
8. Remove from `AgentConfig` union / `KnownAgentConfig`
9. Run full suite + agent-specific tests
10. Build corresponding Docker image to verify

After Stage 4:
- `apps/viberator/src/agents/` contains only `registerPlugins.ts` (and perhaps the thin `AgentFactory` shim if not yet deleted)
- `apps/viberator/src/acp/` is empty or only contains generic code (which should have moved to core in Stage 1)
- `apps/viberator/src/types/agents.ts` contains only `ResourceLimits` + the `AgentConfig` union → delete the file; `BaseAgentConfig` is re-exported from core
- `apps/viberator/src/workers/runtime/Clanker*Factory.ts` are fully generic; `CodexAuthManager` no longer lives here

---

### Stage 5 — Clean up `apps/viberator`

**Goal:** delete dead code and finalize the slim orchestrator app.

Tasks:
1. Delete `AgentFactory.ts` — call sites use `agentRegistry().createAgent()` directly.
2. Delete `apps/viberator/src/types/agents.ts` if now empty.
3. Delete `apps/viberator/src/agents/index.ts` barrel if only `registerPlugins` remains; export directly.
4. Run `knip` / `ts-prune` to find unused exports and remove them.
5. Verify line counts: `apps/viberator/src/agents/` should be ≤ 50 lines total; runtime factories ≤ 50 lines each.
6. Update `.agents/AGENTS.md` with the new extension pattern: "To add a new agent, create `packages/agents/agent-<name>/`, export a plugin descriptor, and register it in `apps/viberator/src/agents/registerPlugins.ts`."

Deliverables: clean, small `apps/viberator/src/agents/` and `runtime/` directories.

---

### Stage 6 — Generated `workerImageCatalog.json` + templated Dockerfiles

**Goal:** remove the last hand-edited, per-agent file and close the extension gap.

Tasks:
1. Create `packages/types/scripts/generate-worker-image-catalog.ts`:
   - Imports `buildAgentRegistry()` from `apps/viberator` (or a headless variant from `@viberglass/agent-core` that takes an explicit plugin list)
   - Extracts `plugin.docker` metadata from each plugin
   - Assembles catalog entries matching current JSON schema
   - Adds multi-agent aggregate entry (Claude-specific + multi-agent combinations) — these stay hardcoded in the script since they span plugins
   - Writes `packages/types/src/workerImageCatalog.json`
   - Exits non-zero on schema drift
2. Add `npm run generate:catalog -w @viberglass/types` script; wire into `prebuild` of the types package.
3. Use the Stage 0 snapshot to assert byte-for-byte parity with the old hand-edited file (modulo ordering — sort entries by variant). Fix discrepancies.
4. CI check: run generator, fail if `workerImageCatalog.json` is dirty afterwards.
5. Create `infra/workers/docker/scripts/compose-dockerfile.sh` (or `.ts`):
   - Accepts `--agent <id>` or `--multi`
   - Reads base Dockerfile template + plugin fragments
   - Outputs composed Dockerfile to `infra/workers/docker/generated/`
6. Update CI / build scripts to compose Dockerfiles on demand instead of maintaining them by hand.
7. Delete `infra/workers/docker/agents/*.Dockerfile` in favor of the generator (keep `base-worker.Dockerfile` and `viberator-worker-multi-agent.Dockerfile` as templates).

Deliverables:
- Adding a new agent requires: (a) a new `packages/agents/agent-X` package, (b) one line in `registerPlugins.ts`. Nothing else.
- Catalog + Dockerfiles stay in sync automatically.

Risks: Dockerfile composition may regress subtle build-cache layering. Mitigate by generating identical bytes for Pi first and diffing against the current handwritten Dockerfile before deleting it.

---

### Stage 7 — Documentation & template

**Goal:** make adding a new agent trivial for contributors.

Tasks:
1. Write `packages/agents/README.md` with:
   - Plugin architecture overview
   - Step-by-step guide to adding a new agent
   - Descriptor field reference (links to typedoc)
2. Create `packages/agents/_template/` — a copy-able skeleton with placeholder class, config, plugin, Dockerfile fragment, and a README TODO list.
3. Add `npm run new:agent <name>` script that copies `_template` and substitutes the name.
4. Update `.agents/AGENTS.md` to point to the new docs.
5. Add an ADR (`docs/adr/0001-agent-plugin-architecture.md`) documenting the decision, design, and trade-offs.

Deliverables: onboarding path for the next contributor.

---

## Cross-cutting concerns

### Build order

```
packages/types  →  packages/agent-core  →  packages/agents/*  →  apps/viberator  →  apps/platform-backend
```

Update root `scripts.build`:
```json
"build": "npm run build -w @viberglass/types && npm run build -w @viberglass/agent-core && npm run build --workspace-scope '@viberglass/agent-*' --if-present && npm run build --workspaces --if-present"
```

(Exact form depends on npm workspaces version; fall back to explicit sequencing if globs unavailable.)

### Testing strategy

- **Unit tests** stay with their plugin package (e.g. `packages/agents/agent-pi/test/PiCodingAgent.test.ts`)
- **Registry contract tests** in `packages/agent-core/test/AgentRegistry.test.ts`: duplicate detection, lookup, fallback mapper behavior
- **Integration test** in `apps/viberator/test/registerPlugins.test.ts`: loads the real registry, asserts all 8 plugins present with valid descriptors (no duplicate ids, no missing fields, all `create()` constructable with default config)
- **E2E tests** in `tests/e2e` unchanged — they invoke the orchestrator which now uses the registry transparently

### Rollback per stage

- **Stages 0–2:** trivial revert; everything is within `apps/viberator` and `agent-core`
- **Stage 3–4:** revert the per-agent PR to restore local files; the plugin package can be left in place as dead code
- **Stage 5:** reverting deletes is mechanical
- **Stage 6:** the generator script is additive; catalog + Dockerfiles can be re-committed by hand if the generator produces bad output

### Out of scope (explicitly)

- Dynamic runtime plugin loading (no `import()` scanning — Option B rejected)
- Plugin hot-reload
- Non-npm package sources (git URL deps, etc.)
- Renaming any existing API / breaking external callers of `AgentOrchestrator`

---

## Acceptance criteria

A developer adding a hypothetical `Aider` agent should be able to:

1. `npm run new:agent aider`
2. Fill in `AiderAgent.ts`, `config.ts`, `plugin.ts`
3. Add one line: `.register(aiderPlugin)` in `registerPlugins.ts`
4. Run `npm run generate:catalog && npm run build`
5. Ship

**No edits** to:
- `AgentFactory` (it's gone)
- `AgentDefaults.ts` (it's gone)
- `SessionStateManager.ts`, `InstructionFileManager.ts`, `ClankerAgent*Factory.ts` (they're registry-driven)
- `workerImageCatalog.json` (generated)
- `infra/workers/docker/agents/*.Dockerfile` (generated from fragments)
- `types/agents.ts` (gone; `BaseAgentConfig` lives in core)

This is the success metric for the entire refactor.
