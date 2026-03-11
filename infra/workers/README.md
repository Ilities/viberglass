# Worker Images

Docker images for Viberator workers.

## Images

| Dockerfile | Agent | Notes |
|---|---|---|
| `viberator-docker-worker.Dockerfile` | claude-code | Local/Docker |
| `viberator-ecs-worker.Dockerfile` | claude-code | ECS production |
| `viberator-lambda.Dockerfile` | all agents | Lambda |
| `viberator-worker-multi-agent.Dockerfile` | all agents | All CLIs pre-installed |
| `agents/viberator-worker-qwen.Dockerfile` | qwen-cli | |
| `agents/viberator-worker-gemini.Dockerfile` | gemini-cli | |
| `agents/viberator-worker-mistral.Dockerfile` | mistral-vibe | |
| `agents/viberator-worker-codex.Dockerfile` | codex | |
| `agents/viberator-worker-opencode.Dockerfile` | opencode | |
| `agents/viberator-worker-kimi.Dockerfile` | kimi-code | |
| `tasks/viberator-worker-testing.Dockerfile` | claude-code | Testing frameworks |
| `tasks/viberator-worker-deployment.Dockerfile` | claude-code | kubectl, terraform, etc. |

## Build & Push to ECR

One command sets up all repos, builds, and pushes:

```bash
./scripts/setup-harness-images.sh dev   # or prod
./scripts/setup-harness-images.sh dev multi-agent  # specific image only
```

Or manually:

```bash
./scripts/build-workers.sh all
./scripts/push-workers.sh all
```

## Image Selection

ECS workers auto-select image based on clanker agent type. Override via `deploymentConfig.containerImage` (ECS) or `deploymentConfig.imageUri` (Lambda).
