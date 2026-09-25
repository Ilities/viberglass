# AWS first-run walkthrough (Phase 1 exit)

Phase 1 counts as done once setup has been walked through once on the AWS dev stack (agreed 2026-09-24). The e2e suite covers the compose path. This checklist covers what only AWS exercises: the default agent on ECS Fargate, worker images from ECR, and secrets encrypted by a key from SSM.

Record the outcome in `docs/ux/next-steps-handover.md` (Step C).

## Before you start

1. **Deploy this code.** The backend image comes from the `deploy-backend-dev` workflow; the stacks from `pulumi up` in `infra/base`, `infra/platform` and `infra/workers`.
2. **Check the new encryption key exists.** `pulumi up` on `infra/platform` now creates `/viberglass/<env>/backend/secrets-encryption-key` (SecureString) and passes it to the backend as `SECRETS_ENCRYPTION_KEY`.
   - Setup stores the model key and repository token encrypted in the database with it.
   - Without it, step 1 fails with "SECRETS_ENCRYPTION_KEY environment variable must be set".
   - The backend never had it on AWS before, so no existing database secrets depend on another key.
3. **Point the platform stack at the workers stack:** `pulumi config set viberglass:workerStack <org>/<project>/<stack>` in `infra/platform`.
   - That's what sets the `VIBERATOR_ECS_*` variables. Setup only chooses ECS when the ECS handler's own preflight passes with them.
   - Without them, setup falls back to Docker, which the Fargate backend can't run: step 4 would fail on the Docker socket.
4. **Push the agent image you'll pick to ECR.**
   - On ECS, a setup-created runner doesn't name an image. The ECS handler resolves the agent's catalog image in the registry taken from `VIBERATOR_ECS_CONTAINER_IMAGE` (e.g. `viberator-worker-opencode` for OpenCode Go, `viberator-worker-multi-agent` for Anthropic).
   - The dev workflow pushes only `multi-agent` by default. Run `deploy-viberators` with the harness you need, or `all`.
5. **Egress.** The backend must reach the model provider's API (key check) and `api.github.com` (repository check). Workers must reach the provider and GitHub too.
6. **Empty workspace.** Setup only takes over while there's no space with a repository and no active runner. Use a fresh database, or check `GET /api/setup/status` says `complete: false`.

## Walkthrough

| Step | Do | Expect | If not, look at |
|---|---|---|---|
| 0 | Open the frontend and register the first account | Lands on `/setup`, step 1 of 5 | Frontend `VITE_API_URL`; backend `/health` |
| 1 | Pick a provider, paste a real key | "Checking with …", then step 2. A wrong key gets a plain rejection | Backend logs for `ModelKeyChecker`; egress; `SECRETS_ENCRYPTION_KEY` |
| 2 | Enter the repository and a token (use the prefilled token link) | "Can read and push to … · default branch …" on step 3 | `GitHubRepositoryChecker` warnings; the token's repository access |
| 3 | Keep or change the space name, "Create space" | Step 4 starts | `SetupSpaceService` errors (409 if the name is taken) |
| 4 | Wait on "Getting your agent ready" | The runner becomes active. On ECS this registers a task definition; there's no image pull | Runner status message on `GET /api/clankers/<id>`; `EcsProvisioningHandler` logs; the ECR image from "Before" step 4 |
| 5 | "Start the task" with the starter | The task page opens with research running; a research document appears within a few minutes | The job's ECS task in the worker cluster; CloudWatch log group `VIBERATOR_ECS_LOG_GROUP`; job logs on the run page |

## What to check on the way

- **The runner is on ECS.** Settings → Advanced → Agents & runners → "Default agent" shows the ECS strategy (managed), not Docker. `POST /api/setup/agent` returns `compute: "ecs"`.
- **The per-agent image runs as an ECS task.** This hasn't been exercised yet: ECS so far used the shared `ecs` image. If the task starts but exits at once, compare the entrypoint and environment with `viberator-ecs-worker.Dockerfile`.
- **The worker gets the key.** The key is a database secret attached to the runner. Check that the ECS task's environment overrides include the provider's variable (e.g. `OPENCODE_API_KEY`), without printing its value.
- **Model and endpoint.** For OpenCode providers the runner's agent config carries `model` (e.g. `opencode-go/deepseek-v4.1-flash`). For Moonshot it also carries `endpoint`.
- **Known gap, not a failure:** cancelling an ECS run marks it cancelled but doesn't stop the task (handover §1.2).

## Afterwards

- Note what passed, what failed and any fixes in the handover (Step C). Phase 1 is done when steps 0–5 pass.
- To try another provider, run setup again from Settings: the same "Default agent" is reconfigured and restarted.
