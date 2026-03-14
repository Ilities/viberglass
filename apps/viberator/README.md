# Viberator Worker

Executes AI coding agent jobs dispatched from the platform backend via Lambda, ECS, or Docker.

Supported agents: Claude Code, Qwen CLI, Gemini CLI, Mistral Vibe, OpenAI Codex, OpenCode, Kimi Code

## Local Development

```bash
npm install
npm run build
npm run dev:worker
```

## Configuration

Copy `.env.example` to `.env`. Set API keys for the agents you want to use:

```bash
CLAUDE_CODE_API_KEY=
QWEN_CLI_API_KEY=
CODEX_API_KEY=
KIMI_CODE_API_KEY=
MISTRAL_VIBE_API_KEY=
GEMINI_API_KEY=
```

Optional:

```bash
LOG_LEVEL=info        # debug, info, warn, error
MAX_CONCURRENT_JOBS=3
DEFAULT_TIMEOUT=2700  # seconds
```

For production, credentials can be stored in AWS SSM under `/viberglass-viberator/`.
