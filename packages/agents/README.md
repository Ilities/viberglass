# Agent Plugins

This directory contains the individual agent plugin packages for the Viberator orchestrator. Each agent lives in its own workspace package and registers itself via a typed `AgentPlugin` descriptor.

## Architecture Overview

```
packages/agents/
├── agent-antigravity/     @viberglass/agent-antigravity
├── agent-claude-code/     @viberglass/agent-claude-code
├── agent-codex/           @viberglass/agent-codex
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
   Dockerfile.fragment         install steps on the Debian worker image, as the viberator user
   Dockerfile.lambda.fragment  the same install on the Lambda image (Amazon Linux, as root)
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
     label: "Aider",
     create: (config, logger, gitService) => new AiderAgent(config, logger, gitService),
     defaultConfig: { … },
     envAliases: { apiKey: ["AIDER_API_KEY"] },
     stateDirs: [".aider"],
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

4. **Include it in the build**: add `"@viberglass/agent-aider"` to `agents` in `viberglass.plugins.json` (`npm run new:agent` does this), then run `npm run generate:plugins`. That writes `apps/viberator/src/agents/configuredAgentPlugins.ts` and the dependency in `apps/viberator/package.json`.

5. **Write the Dockerfile fragments**: `Dockerfile.fragment` installs the CLI on the Debian worker image, running as the `viberator` user with npm installing under its home; `Dockerfile.lambda.fragment` installs it on the Lambda image, as root on Amazon Linux. Only install steps and the ENV the CLI needs: the generator adds `AGENT_TYPE`, labels and `CMD`.

6. **Build and regenerate**:

   ```bash
   npm install
   npm run build
   npm run generate:catalog      # updates workerImageCatalog.json
   npm run generate:dockerfiles  # creates infra/workers/docker/generated/aider.Dockerfile
   ```

7. **Run tests**:

   ```bash
   npm test -w @viberglass/agent-aider
   ```

The worker build, the catalogs and the worker Dockerfiles all follow `viberglass.plugins.json`, and the runner form takes each harness's name, description, logo, settings and config file editor from the catalog. A harness left out of the build config isn't offered for new runners; runners that already use it keep its id and fail at the worker. `defaultAgent` in the build config names the harness new runners get. Codex's sign-in is still special-cased in the platform until sign-in becomes a harness capability.

Set `docker.testOnly: true` for agents that must never be provisioned in infrastructure or pushed to a registry (see `agent-fake`).

---

## `AgentPlugin` Descriptor Reference

| Field | Required | Description |
|---|---|---|
| `id` | ✅ | Unique agent identifier (matches `BaseAgentConfig.name`). Use kebab-case. |
| `label` | ✅ | Name shown in the UI and logs. |
| `description` | ✅ | One sentence the runner form shows under the name. |
| `logo` | — | Logo file relative to the package root, e.g. `logo.svg`. `npm run generate:catalog` copies it into the frontend. |
| `telemetryProvider` | — | The `gen_ai.provider.name` the harness's traces carry. Leave unset when the provider depends on configuration. |
| `create(config, logger, gitService?)` | ✅ | Factory function; returns a `BaseAgent` instance. |
| `defaultConfig` | ✅ | Default config values (`Omit<C, "name">`). |
| `envAliases.apiKey` | — | Env var names the harness reads the API key from. |
| `envAliases.endpoint` | — | Env var names the harness reads the endpoint from. |
| `agentEnv` | — | Other env vars the harness CLI reads, such as its config dir. Agent CLIs get a deny-by-default environment: a variable reaches them only if a configured plugin names it here, in `envAliases`, `providers` or `settings`. Platform credentials never do. |
| `stateDirs` | — | `$HOME`-relative paths holding the agent's sessions (e.g. `[".aider"]`), archived after each turn and restored before the next so the session resumes. Check where the harness really writes: opencode, for one, uses `~/.local/share/opencode`, not `~/.opencode`. |
| `stateExcludes` | — | Paths inside `stateDirs` left out of the archive, such as credential files the worker injects fresh each run. |
| `harnessConfigPatterns` | — | Relative file patterns in `.harness-config/` the harness should materialise for this agent. |
| `harnessConfigEditor` | — | `{ fileType, label, envReferences, template }`: the config file the runner form edits. `fileType` is one of `harnessConfigPatterns`; `envReferences` are how the file refers to an env var, with `NAME` in its place (the editor writes the first); `template` fills an empty editor. |
| `settings` | — | Settings the runner form shows, stored on the runner's agent config under each `key`: `{ key, label, type: "string" \| "select", description?, placeholder?, options?, allowCustom?, providerDefault?, env }`. The worker sets each `env` var to the runner's value, so it must be on the agent env allowlist. `providerDefault` (`"model"` or `"endpoint"`) fills the setting from the chosen provider's default. Backticks in `description` show as code. |
| `materializeHarnessConfig` | — | Called after each matching harness-config file is written; use for side-effects like writing `$HOME/.aider/config`. |
| `acpEventMapper` | — | Custom ACP event mapper. Falls back to the generic mapper if absent. |
| `authLifecycle(ctx)` | — | Returns an `AgentAuthLifecycle` for agents that require device auth (e.g. Codex). |
| `customEndpoints` | — | `{ apiFormats, environment, rank? }`: the model API formats the harness runs a workspace's custom endpoint with. A custom endpoint runs on the lowest-`rank` harness that speaks its format; unranked harnesses come last. |
| `providers` | — | Model providers this harness can run: `{ provider, envVar, default?, model?, endpoint? }`. `provider` is an id from `MODEL_PROVIDERS` (`packages/types/src/modelProviders.ts`); `envVar` is where the harness reads the key, and setup stores the key as a secret with that name. Exactly one harness is `default` per provider; setup uses it for pasted keys. `model`/`endpoint` go into the runner config when the harness can't infer them. Feeds `agentProviderCatalog.json`. |
| `docker.variant` | ✅ | Docker image variant name (e.g. `"aider"`). Used as filename: `generated/aider.Dockerfile`. |
| `docker.repositoryName` | ✅ | ECR repository name (e.g. `"viberator-worker-aider"`). |
| `docker.scriptImageName` | ✅ | Short name used in build/push scripts (e.g. `"worker-aider"`). |
| `docker.supportedAgents` | ✅ | Agent IDs this image can run. Usually `[id]`. |
| `docker.defaultForAgents` | ✅ | Agent IDs this image is the default image for. Usually `[id]`. |
| `docker.dockerfilePath` | — | Override the Dockerfile path in the catalog (default: `infra/workers/docker/generated/<variant>.Dockerfile`). |

---

## Generated Artifacts

### `agentProviderCatalog.json`

`packages/types/src/agentProviderCatalog.json` lists which harness runs which provider's keys, from each plugin's `providers`. The same `npm run generate:catalog` writes it, and fails when a plugin names a provider missing from `MODEL_PROVIDERS` or a provider doesn't have exactly one default harness. A new provider is a `MODEL_PROVIDERS` entry (display name, key page, distinctive key prefixes, key check request) plus a binding in the harness that runs it.

### `workerImageCatalog.json`

`packages/types/src/workerImageCatalog.json` is generated from plugin descriptors:

```bash
npm run build            # build all packages first
npm run generate:catalog # regenerate the catalog
```

Commit the updated JSON. CI verifies the committed file matches what the generator produces.

### Agent Dockerfiles

`npm run generate:dockerfiles` writes, from the harnesses in `viberglass.plugins.json`:

- `infra/workers/docker/generated/<variant>.Dockerfile`: one per harness, `FROM` the base worker image plus its `Dockerfile.fragment`
- `viberator-worker-multi-agent.Dockerfile`: `base/base-worker.Dockerfile` with every shipped harness's `Dockerfile.fragment`
- `viberator-ecs-worker.Dockerfile`: the same with only the build's `defaultAgent`
- `viberator-lambda.Dockerfile`: `base/lambda-worker.Dockerfile` with every shipped harness's `Dockerfile.lambda.fragment`

Fragments go in at the `# HARNESS INSTALLS` line of the template, before the app, so a code change doesn't reinstall the harnesses.

```bash
npm run generate:dockerfiles
```

Do **not** edit the generated files by hand; they will be overwritten. Edit the fragments and templates.
