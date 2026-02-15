# Viberator Worker Images

This directory contains Docker worker images for different clanker configurations. Each worker image is optimized for specific agent types or task types.

## Available Worker Images

### Base Images

#### `base/base-worker.Dockerfile`
Base worker image with common dependencies. Extend this for custom workers.

**Includes:**
- Node.js 24
- Git, curl, wget
- Viberator worker CLI
- Non-root user setup

---

### Agent-Specific Workers

All agent-specific workers include their respective CLI tools installed from official sources:

#### `viberator-docker-worker.Dockerfile` (Claude Code)
Default worker with Claude Code CLI support.

**Agent:** `claude-code`
**CLI Source:** `npm install -g @anthropic-ai/claude-code`
**Use Case:** General-purpose coding tasks with Claude

#### `viberator-ecs-worker.Dockerfile` (Claude Code)
Optimized for AWS ECS/Fargate deployment.

**Agent:** `claude-code`
**Use Case:** Production ECS deployments

#### `viberator-lambda.Dockerfile` (Claude Code)
Optimized for AWS Lambda container images.

**Agent:** `claude-code`
**Use Case:** Lightweight Lambda deployments

#### `agents/viberator-worker-qwen.Dockerfile`
Worker with Qwen Code CLI support.

**Agent:** `qwen-cli`, `qwen-api`
**CLI Source:** `npm install -g @qwen-code/qwen-code@latest`
**Docs:** https://qwenlm.github.io/qwen-code-docs/
**Use Case:** Using Qwen AI models for code analysis and editing

#### `agents/viberator-worker-gemini.Dockerfile`
Worker with Google Gemini CLI support.

**Agent:** `gemini-cli`
**CLI Source:** `npm install -g @google/gemini-cli`
**Docs:** https://geminicli.com/docs/get-started/installation/
**Use Case:** Using Google Gemini AI models

#### `agents/viberator-worker-mistral.Dockerfile`
Worker with Mistral Vibe CLI support.

**Agent:** `mistral-vibe`
**CLI Source:** `uv tool install mistral-vibe`
**Docs:** https://docs.mistral.ai/mistral-vibe/introduction/install
**Use Case:** Using Mistral AI models

#### `agents/viberator-worker-codex.Dockerfile`
Worker with OpenAI Codex CLI support.

**Agent:** `codex`
**CLI Source:** `npm install -g @openai/codex`
**Docs:** https://github.com/openai/codex
**Use Case:** Using OpenAI Codex for terminal-based coding

#### `agents/viberator-worker-opencode.Dockerfile`
Worker with OpenCode CLI support.

**Agent:** `opencode`
**CLI Source:** `npm install -g opencode-ai@latest`
**Docs:** https://opencode.ai/docs
**Use Case:** Using OpenCode for terminal-based coding workflows

#### `agents/viberator-worker-kimi.Dockerfile`
Worker with Kimi Code CLI support.

**Agent:** `kimi-code`
**CLI Source:** `curl -fsSL https://cli.moonshot.ai/kimi.sh | bash`
**Docs:** https://moonshotai.github.io/Kimi-K2/cli/getting-started/
**Use Case:** Using Moonshot Kimi Code in automated coding workflows

---

### Task-Specific Workers

#### `viberator-worker-multi-agent.Dockerfile`
Universal worker with all agent CLIs pre-installed.

**Agents:** `claude-code`, `qwen-cli`, `qwen-api`, `gemini-cli`, `mistral-vibe`, `codex`, `opencode`, `kimi-code`

**CLI Sources:**
- Claude Code: `npm install -g @anthropic-ai/claude-code`
- Qwen Code: `npm install -g @qwen-code/qwen-code@latest`
- Gemini: `npm install -g @google/gemini-cli`
- Codex: `npm install -g @openai/codex`
- OpenCode: `npm install -g opencode-ai@latest`
- Kimi Code: `curl -fsSL https://cli.moonshot.ai/kimi.sh | bash`
- Mistral Vibe: `uv tool install mistral-vibe`

**Use Case:** Maximum flexibility, switch between agents without rebuilding

---

### Task-Specific Workers

#### `tasks/viberator-worker-testing.Dockerfile`
Worker optimized for testing tasks.

**Includes:**
- All testing frameworks (Jest, Vitest, Mocha, Pytest)
- Multiple language runtimes (Node.js, Python, Java)
**Use Case:** Test generation and execution

#### `tasks/viberator-worker-deployment.Dockerfile`
Worker with deployment tools.

**Includes:**
- kubectl, Helm
- AWS CLI
- Docker CLI
- Terraform
- Pulumi, Serverless Framework
**Use Case:** Infrastructure and deployment automation

#### `tasks/viberator-worker-fullstack.Dockerfile`
Full-stack worker with all development tools.

**Includes:**
- Multiple language runtimes (Node.js, Python, Java, Ruby, Go, Rust)
- Build tools (gcc, make, cmake)
- Linters and formatters
- Database clients
**Use Case:** Complete project handling across all languages

---

## Building Worker Images

### Build All Images

```bash
./scripts/build-workers.sh all
```

### Build Specific Image

```bash
./scripts/build-workers.sh qwen
./scripts/build-workers.sh testing
```

### Build with Custom Tag

```bash
./scripts/build-workers.sh all v1.0.0
```

### Build with Registry Prefix

```bash
export VIBERATOR_WORKER_REGISTRY=docker.io/myorg
export VIBERATOR_WORKER_IMAGE_PREFIX=viberator
./scripts/build-workers.sh all
```

---

## Pushing Worker Images

### Push All Images

```bash
export VIBERATOR_WORKER_REGISTRY=docker.io/myorg
./scripts/push-workers.sh all
```

### Push Specific Image

```bash
export VIBERATOR_WORKER_REGISTRY=123456.dkr.ecr.us-east-1.amazonaws.com
./scripts/push-workers.sh qwen v1.0.0
```

---

## Worker Image Selection

The `ClankerProvisioningService` automatically selects the appropriate worker image based on the clanker's agent type.

### Selection Logic

1. **Explicit Configuration:** If `deploymentConfig.containerImage` is set, use that
2. **Agent-Based:** Auto-select based on agent type:
   - `qwen-cli`, `qwen-api` → `viberator-worker-qwen`
   - `gemini-cli` → `viberator-worker-gemini`
   - `mistral-vibe` → `viberator-worker-mistral`
   - `codex` → `viberator-worker-codex`
   - `opencode` → `viberator-worker-opencode`
   - `kimi-code` → `viberator-worker-kimi`
   - `claude-code` or other → `viberator-worker-multi-agent`

### Environment Variables

Configure image selection via environment variables:

```bash
# Set registry prefix
export VIBERATOR_WORKER_REGISTRY=123456.dkr.ecr.us-west-1.amazonaws.com

# Set image name prefix
export VIBERATOR_WORKER_IMAGE_PREFIX=viberator

# ECS-specific defaults
export VIBERATOR_ECS_CONTAINER_IMAGE=123456.dkr.ecr.us-west-1.amazonaws.com/viberator-worker-multi-agent:latest

# Lambda-specific defaults
export VIBERATOR_LAMBDA_IMAGE_URI=123456.dkr.ecr.us-west-1.amazonaws.com/viberator-worker-multi-agent:latest
```

---

## Clanker Configuration Examples

### Qwen Agent Clanker

```json
{
  "name": "Qwen Code Fixer",
  "agent": "qwen-cli",
  "deploymentStrategyId": "ecs",
  "deploymentConfig": {
    "cpu": "2048",
    "memory": "4096"
  }
}
```

**Result:** Auto-selects `viberator-worker-qwen` image

### Testing-Focused Clanker

```json
{
  "name": "Test Generator",
  "agent": "claude-code",
  "deploymentStrategyId": "lambda",
  "deploymentConfig": {
    "imageUri": "docker.io/myorg/viberator-worker-testing:latest"
  }
}
```

**Result:** Uses testing worker explicitly

### Multi-Agent Clanker

```json
{
  "name": "Universal Worker",
  "agent": "claude-code",
  "deploymentStrategyId": "ecs",
  "deploymentConfig": {}
}
```

**Result:** Auto-selects `viberator-worker-multi-agent` for flexibility

---

## Image Sizes (Approximate)

| Image | Size | Notes |
|-------|------|-------|
| Base Worker | ~300MB | Minimal dependencies |
| Claude Code Worker | ~800MB | Includes Claude Code CLI |
| Qwen Worker | ~850MB | + Qwen CLI |
| Gemini Worker | ~850MB | + Gemini CLI |
| Mistral Worker | ~850MB | + Mistral Vibe CLI |
| Codex Worker | ~850MB | + Codex CLI |
| OpenCode Worker | ~850MB | + OpenCode CLI |
| Kimi Worker | ~850MB | + Kimi Code CLI |
| Multi-Agent Worker | ~1.2GB | All agent CLIs |
| Testing Worker | ~1.1GB | Testing frameworks |
| Deployment Worker | ~1.5GB | kubectl, terraform, etc. |
| Fullstack Worker | ~2.5GB | All development tools |

---

## Quick Start

1. **Build local development worker:**
   ```bash
   ./scripts/build-workers.sh claude
   ```

2. **Build all images for production:**
   ```bash
   export VIBERATOR_WORKER_REGISTRY=your-registry.com
   ./scripts/build-workers.sh all latest
   ```

3. **Push to registry:**
   ```bash
   ./scripts/push-workers.sh all latest
   ```

4. **Create a clanker with your chosen agent:**
   ```bash
   curl -X POST https://your-api.com/api/clankers \
     -H "Content-Type: application/json" \
     -d '{
       "name": "My Qwen Worker",
       "agent": "qwen-cli",
       "deploymentStrategyId": "your-ecs-strategy-id"
     }'
   ```

---

## Notes

- Agent CLI installation sources:
  - Claude Code: `@anthropic-ai/claude-code`
  - Qwen Code: `@qwen-code/qwen-code` - https://qwenlm.github.io/qwen-code-docs/
  - Gemini: `@google/gemini-cli` - https://geminicli.com/docs/get-started/installation/
  - Codex: `@openai/codex` - https://github.com/openai/codex
  - OpenCode: `opencode-ai` - https://opencode.ai/docs
  - Mistral Vibe: `uv tool install mistral-vibe` - https://docs.mistral.ai/mistral-vibe/introduction/install
- The multi-agent worker is recommended for development and testing
- Use agent-specific workers in production for smaller image sizes
- Task-specific workers include additional tools that increase image size but provide specialized capabilities
