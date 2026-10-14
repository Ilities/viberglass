# Viberator Worker

Executes AI coding agent jobs dispatched from the platform backend via Docker, ECS, Lambda, or Kubernetes Jobs.

Supported agents: Claude Code, Qwen CLI, Google Antigravity, Mistral Vibe, OpenAI Codex, OpenCode, Kimi Code, Pi. The set compiled into the worker comes from the `agents` list in `viberglass.plugins.json` (see [packages/agents](../../packages/agents/README.md)).

## Local Development

```bash
npm install
npm run build:worker   # from the repository root: builds the worker and its agent packages
npm run dev:worker -w @viberator/orchestrator
```

## Configuration

Copy `.env.example` to `.env`. Set API keys for the agents you want to use. Each agent reads `<AGENT_ID>_API_KEY` (for example `CLAUDE_CODE_API_KEY`, `QWEN_CLI_API_KEY`, `KIMI_CODE_API_KEY`) or its provider's usual variable:

```bash
ANTHROPIC_API_KEY=     # Claude Code, Pi
OPENAI_API_KEY=        # Codex, OpenCode
QWEN_CLI_API_KEY=
KIMI_API_KEY=
MISTRAL_API_KEY=
GEMINI_API_KEY=        # Antigravity
```

Optional:

```bash
LOG_LEVEL=info        # debug, info, warn, error
MAX_CONCURRENT_JOBS=3
DEFAULT_TIMEOUT=2700  # seconds
```

With `AWS_REGION` and `SSM_PARAMETER_PATH` set, the worker also reads overrides from AWS SSM Parameter Store under that path.
