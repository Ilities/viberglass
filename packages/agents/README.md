# Agent Plugins

This directory contains the individual agent plugin packages for the Viberator orchestrator. Each agent lives in its own workspace package and registers itself via a typed `AgentPlugin` descriptor.

## Architecture Overview

```
packages/agents/
├── agent-claude-code/     @viberglass/agent-claude-code
├── agent-codex/           @viberglass/agent-codex
├── agent-gemini/          @viberglass/agent-gemini
├── agent-kimi/            @viberglass/agent-kimi
├── agent-mistral-vibe/    @viberglass/agent-mistral-vibe
├── agent-opencode/        @viberglass/agent-opencode
├── agent-pi/              @viberglass/agent-pi
├── agent-qwen/            @viberglass/agent-qwen
└── _template/             Copy-paste skeleton for new agents
```

Each package exports a default `AgentPlugin` descriptor from `src/plugin.ts` and re-exports everything from `src/index.ts`.

### Core interfaces

All core types live in `@viberglass/agent-core`:

- `AgentPlugin<C>` — the descriptor that wires together the agent class, defaults, env aliases, Docker metadata, and optional runtime hooks
- `BaseAgent` — the abstract base class every agent extends
- `AgentRegistry` — the registry loaded from `apps/viberator/src/agents/registerPlugins.ts`

### Build order

```
@viberglass/types → @viberglass/agent-core → @viberglass/agent-* → @viberator/orchestrator
```

---

## Adding a New Agent

### Quick start

```bash
npm run new:agent <name>
# e.g. npm run new:agent aider
```

This copies `packages/agents/_template/` to `packages/agents/agent-<name>/` and substitutes the placeholder name.

### Manual steps (or after running the script)

1. **Scaffold the package** under `packages/agents/agent-<name>/`:

   ```
   package.json         name: "@viberglass/agent-<name>"
   tsconfig.json        extends repo base tsconfig
   tsup.config.ts       entry: src/index.ts
   src/
     config.ts          export interface <Name>Config extends BaseAgentConfig { name: "<name>" }
     <Name>Agent.ts     export class <Name>Agent extends BaseAgent { … }
     plugin.ts          export default agentPlugin (AgentPlugin<<Name>Config>)
     index.ts           re-exports
   test/
     <Name>Agent.test.ts
   Dockerfile.fragment  agent-specific install + ENV + LABEL lines
   ```

2. **Implement the agent class** in `src/<Name>Agent.ts`:

   ```ts
   import { BaseAgent, AgentCLIResult, ExecutionContext } from "@viberglass/agent-core";

   export class AiderAgent extends BaseAgent {
     protected async executeAgentCLI(ctx: ExecutionContext): Promise<AgentCLIResult> {
       // spawn the CLI, stream output, return result
     }
   }
   ```

3. **Fill in the plugin descriptor** in `src/plugin.ts`:

   ```ts
   import type { AgentPlugin } from "@viberglass/agent-core";
   import type { AiderConfig } from "./config";
   import { AiderAgent } from "./AiderAgent";

   const aiderPlugin: AgentPlugin<AiderConfig> = {
     id: "aider",
     displayName: "Aider",
     create: (config, logger, gitService) => new AiderAgent(config, logger, gitService),
     defaultConfig: { … },
     envAliases: { apiKey: ["AIDER_API_KEY"] },
     stateDir: ".aider",
     docker: {
       variant: "aider",
       repositoryName: "viberator-worker-aider",
       scriptImageName: "worker-aider",
       supportedAgents: ["aider"],
       defaultForAgents: ["aider"],

     },
   };

   export default aiderPlugin;
   ```

4. **Add the dependency** in `apps/viberator/package.json`:

   ```json
   "@viberglass/agent-aider": "*"
   ```

5. **Register the plugin** in `apps/viberator/src/agents/registerPlugins.ts`:

   ```ts
   import aiderPlugin from "@viberglass/agent-aider";
   // …
   .register(aiderPlugin)
   ```

6. **Write the Dockerfile fragment** in `Dockerfile.fragment` — agent-specific install, verify, ENV, and LABEL lines. The compose script wraps it with the standard FROM header and CMD footer.

7. **Build and regenerate**:

   ```bash
   npm install
   npm run build
   npm run generate:catalog      # updates workerImageCatalog.json
   npm run generate:dockerfiles  # creates infra/workers/docker/generated/aider.Dockerfile
   ```

8. **Run tests**:

   ```bash
   npm test -w @viberglass/agent-aider
   ```

**No other files need to change.** `SessionStateManager`, `InstructionFileManager`, `ClankerAgent*Factory`, and `ConfigManager` are all registry-driven.

---

## `AgentPlugin` Descriptor Reference

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Unique agent identifier (matches `BaseAgentConfig.name`). Use kebab-case. |
| `displayName` | ✅ | Human-readable name shown in UI / logs. |
| `create(config, logger, gitService?)` | ✅ | Factory function; returns a `BaseAgent` instance. |
| `defaultConfig` | ✅ | Default config values (`Omit<C, "name">`). |
| `envAliases.apiKey` | — | Env var names the harness reads the API key from. |
| `envAliases.endpoint` | — | Env var names the harness reads the endpoint from. |
| `stateDir` | — | `$HOME` subdirectory where the agent stores conversation state (e.g. `".aider"`). |
| `harnessConfigPatterns` | — | Relative file patterns in `.harness-config/` the harness should materialise for this agent. |
| `materializeHarnessConfig` | — | Called after each matching harness-config file is written; use for side-effects like writing `$HOME/.aider/config`. |
| `acpEventMapper` | — | Custom ACP event mapper. Falls back to the generic mapper if absent. |
| `authLifecycle(ctx)` | — | Returns an `AgentAuthLifecycle` for agents that require device auth (e.g. Codex). |
| `endpointEnvironment(ctx)` | — | Returns an `AgentEndpointEnvironment` for agents whose API endpoint is resolved at runtime. |
| `docker.variant` | ✅ | Docker image variant name (e.g. `"aider"`). Used as filename: `generated/aider.Dockerfile`. |
| `docker.repositoryName` | ✅ | ECR repository name (e.g. `"viberator-worker-aider"`). |
| `docker.scriptImageName` | ✅ | Short name used in build/push scripts (e.g. `"worker-aider"`). |
| `docker.supportedAgents` | ✅ | Agent IDs this image can run. Usually `[id]`. |
| `docker.defaultForAgents` | ✅ | Agent IDs this image is the default image for. Usually `[id]`. |
| `docker.isAgentImage` | — | `false` if the agent reuses a shared image (default: `true`). |
| `docker.dockerfilePath` | — | Override the Dockerfile path in the catalog (default: `infra/workers/docker/generated/<variant>.Dockerfile`). |

---

## Generated Artifacts

### `workerImageCatalog.json`

`packages/types/src/workerImageCatalog.json` is generated from plugin descriptors:

```bash
npm run build            # build all packages first
npm run generate:catalog # regenerate the catalog
```

Commit the updated JSON. CI verifies the committed file matches what the generator produces.

### Agent Dockerfiles

`infra/workers/docker/generated/<variant>.Dockerfile` files are composed from:

1. Standard header (`ARG BASE_IMAGE`, `FROM`, `ENV PATH`)
2. `packages/agents/agent-<name>/Dockerfile.fragment` (all agent-specific content)
3. Standard `CMD` footer

```bash
npm run generate:dockerfiles
```

Do **not** edit files in `infra/workers/docker/generated/` by hand — they will be overwritten.
