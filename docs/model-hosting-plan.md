# Model hosting: custom endpoints, Bedrock, and deployed open-weight models

Status: phases 1, 3 and 4 implemented for Verda, 2026-10-06; live GPU trial pending · Owner of decisions: Jussi

## Goal

Let a workspace run its agents on models it controls. The reasons, in priority order:

- **EU data residency.** Code and prompts stay with EU providers: Verda (Finland) and OVHcloud (France).
- **Open-weight models.** Qwen3-Coder, GLM, DeepSeek, gpt-oss, and fine-tunes that the current providers don't offer.
- **The customer's own cloud account.** Inference is billed to the customer's AWS, Verda or OVH account and stays inside it.

## Decisions already made

| Topic | Decision |
|---|---|
| Scope | Viberglass deploys models itself. Viberglass also accepts any URL that is already running. |
| Provider coupling | Use a **generic endpoint form** (URL, API format, auth header, model) instead of one data entry per cloud. Per-cloud code exists only where Viberglass creates the GPU deployment. |
| Product shape | A model deployment is a **workspace resource**. Runners pick it the same way they pick a shared key, so one GPU serves many runners. |
| Lifecycle | **The provider scales to zero**, plus manual **Keep warm** and **Stop** overrides. Viberglass has no scheduler of its own. |
| Model choice | Models come from **vLLM Recipes**, an open-source catalog. A generic form takes any Hugging Face model. |
| Clouds | Verda first. OVH AI Deploy waits until someone needs it (2026-10-06). |
| Cold start | A job waits for the deployment to wake and shows its progress. The harness never sees the cold start. |
| Bedrock auth | A Bedrock API key on a generic endpoint. The task role is not passed to agents (2026-10-06, see phase 2). |
| Harnesses | OpenCode and Pi come first. The rest follow as their plugins learn custom endpoints. Most harnesses already speak an OpenAI- or Anthropic-compatible API. |

## Why this lifecycle

Both EU clouds sell managed containers that can scale to zero: Verda serverless containers and OVH AI Deploy with minimum replicas 0. With those, Viberglass only has to create the deployment, read its status, change its replica bounds, and delete it. Autoscaling, TLS, restarts and idle shutdown stay with the provider.

A Viberglass-run start/stop scheduler would need reference counting, a durable idle timer, and a reconciler for orphaned VMs. Any bug there leaves a GPU running and billing at about €3/h. That only pays off on raw VMs, so raw VMs are deferred (phase 5).

AWS doesn't need EC2 for the same goals. Since February 2026, Bedrock serves Qwen3 Coder Next, GLM 4.7/5, DeepSeek V3.2 and Kimi K2.5 on demand. Bedrock Custom Model Import covers custom weights and also scales to zero.

## Architecture

The work is three layers. Each one is usable before the next exists.

```
Runner ──picks──▶ Model endpoint ◀──owns── Model deployment ──via──▶ ModelHost adapter
                  (URL, format,             (recipe/HF id, flavour,      (Verda containers,
                   auth, models)             cloud account, state)        OVH AI Deploy)
```

1. **Model endpoint.** A generic, workspace-scoped record for any OpenAI- or Anthropic-compatible URL. It can be entered by hand or created by a deployment.
2. **Bedrock role auth.** The one auth mode that isn't a header: SigV4 with the runner's AWS role.
3. **Model deployment.** A GPU deployment that Viberglass creates in the customer's cloud account. It owns exactly one model endpoint.

---

## Implementation progress (2026-10-06)

Phases 3 and 4 are built for Verda; phase 2 is replaced by the Bedrock API key path; OVH is not started.

- **Cloud accounts** (`model_host_accounts`): a Verda account holds the client ID, and the client secret, inference API key and optional Hugging Face token as platform-managed secrets (`purpose = model_host`) that pickers and the secret lists leave out. They are managed in a Cloud accounts section on the Secrets page, or inline when deploying.
- **Adapter**: `packages/model-hosting-verda` implements `ModelHost` (`listFlavours`, `create`, `getStatus`, `setMode`, `delete`) against the Verda API. It is registered in `ModelHostRegistry` in the backend composition root. A deployment runs `vllm/vllm-openai:v0.31.0` on port 8000 with `/health` as its healthcheck, `HF_HOME` on the deployment's scratch disk, shared memory sized to the GPU count, and scaling of 0–1 replicas with a 5-minute idle window. Keep warm sets the minimum to 1; Stop pauses the deployment.
- **Deployments** (`model_deployments`): creating one creates its endpoint (`source = deployment`, bearer auth with the account's inference key, `may_cold_start`) in the same transaction. If saving fails, the cloud deployment is deleted again. Deleting a deployment is refused while runners use it. The cloud's errors reach the admin as HTTP 502 with Verda's message.
- **Catalog**: `/models.json`, `/{model}.json` and `/{model}/hw/{hw}.json` from recipes.vllm.ai, cached for an hour. The serving arguments are the recipe's `argv` after `vllm serve <model>`, with the recipe's tool-calling flags added if the command lacks them. Recipes only list "verified" hardware (h100, h200, b200…), so Verda's L40S and RTX PRO 6000 are reachable only through the generic form.
- **Wake and stop**: when a run is dispatched against a deployment endpoint, a stopped deployment fails it at once ("<name> is stopped. Start it or pick another endpoint."). Otherwise, an endpoint that may cold-start gets one `GET /models` so it boots while the worker starts. The worker's existing readiness wait then shows "Waking … ".
- **UI**: Settings → Model deployments lists each deployment's state, price and runners, with mode changes and Delete. The deploy dialog picks an account, a recipe model or any Hugging Face id, a GPU (filtered to recipe hardware and VRAM, with prices), the serving arguments (one per line) and a name.

Facts settled with the live Verda API (no GPU spend):

- Compute names match `container-types` `model` (`H100`, `L40S`, `RTX PRO 6000`). `CPU Node` resources use `size` for vCPUs and are left out.
- Prices are public in EUR (`/container-types?currency=eur`): L40S €1.52/h, RTX PRO 6000 €2.03/h, H100 €3.68/h.
- Verda puts its own auth in front of every container: requests need the account's *inference API key*, which the API can't create. vLLM's `--api-key` is therefore not used.
- Creating a deployment needs a positive account balance ("You must add balance to run deployments").

**Live exit still open:** min-replica-0 acceptance, whether `GET /v1/models` wakes a scaled-to-zero container, the status values during a real cold start, and an OpenCode task on a deployment all need a funded Verda account. The probe failed on a zero balance before anything was created.

## Implementation progress (2026-10-04)

The first implementation covers generic model endpoints and readiness polling for manual endpoints. Bedrock role auth and cloud-created deployments remain planned; phase 5 remains deferred.

- Workspace endpoint records and runner references, with foreign keys preventing removal of a used endpoint or its key. The current application has one workspace per database, matching shared secrets and MCP servers.
- Admin API for list/create/update/delete and connection/model discovery. Authentication reuses shared secrets; the check refuses redirects. Manual model IDs work when discovery is unavailable. Deployment-owned records cannot be edited through this API.
- Inline endpoint and key creation, endpoint/model selection, and editing in the runner form. Plugin metadata filters supported API formats: OpenCode supports `openai-chat`; Pi supports all three formats.
- The worker resolves plugin-specific configuration. OpenCode receives a provider in `OPENCODE_CONFIG_CONTENT`; Pi writes per-job `pi/models.json` and default-model settings. Keys remain environment references rather than raw values in stored/generated configuration. Literal Pi headers are escaped to prevent command or environment interpolation.
- Pi requires a placeholder key to make custom models selectable. Its SDK may send an anonymous auth header alongside the configured custom header; only the selected auth header carries the real key.
- Manual endpoints marked as potentially cold wait for authenticated `GET /models` before the harness launches, with progress, a 15-minute timeout, and immediate failure on authentication rejection. Deployment wake requests and stopped-state detection need the deployment layer.
- Harness installs are pinned to the versions exercised: OpenCode 1.18.34, Pi 1.0.2 and pi-acp 0.0.34.

The migration and endpoint API were exercised on an isolated local PostgreSQL database. Both real harness CLIs completed requests against a local OpenAI-compatible test server, including custom auth headers after worker environment filtering. The full workspace unit suite passed after updating stale MCP/skill fixtures. Agent-browser checks covered inline endpoint creation, runner creation, and preserving the endpoint/model when editing and saving. Backend, worker and frontend builds passed.

**Live-provider exit remains open:** OVH's model discovery returned HTTP 200 with Qwen3-Coder and gpt-oss models, but an anonymous completion request returned HTTP 429 (`API rate limit exceeded`). A successful local harness test does not establish a successful live OVH task.

The cloud lifecycle questions and paid GPU trials below still need resolution before implementing managed deployments. No GPU resources have been created.

## Phase 1: Generic model endpoints

This phase alone makes the following usable without any per-cloud code: OVH AI Endpoints, Verda managed endpoints, Bedrock's OpenAI-compatible API with a Bedrock API key, a Verda container or OVH AI Deploy app that someone set up by hand, and any self-hosted vLLM or SGLang server.

**Data.** A new `model_endpoints` table, scoped to the workspace:

- `name`, `base_url`
- `api_format`: `openai-chat` | `openai-responses` | `anthropic-messages`
- `auth`: `{ scheme: 'bearer' }` | `{ scheme: 'header', header }` | `{ scheme: 'none' }`, with `secret_id` pointing at a shared secret
- `extra_headers`: headers that aren't secret
- `models`: discovered from `GET {base_url}/models` when that works, otherwise typed in
- `source`: `manual` | `deployment` (with `deployment_id`). Endpoints that a deployment owns are read-only in the form.
- `may_cold_start`: true for deployment endpoints, and can be ticked for manual ones (see phase 4)

**Key check.** Reuse the `ModelKeyCheck` logic in `modelProviders.ts` with a URL that comes from the record instead of a constant. Run `GET {base}/models` with the configured auth.

**Runner form.** The provider-first picker gets a "Custom endpoints" group listing the workspace's endpoints, below the built-in providers. Picking one fills in the model from the endpoint's model list. "Add endpoint" works inline, just as "add key" does.

**Harness plumbing.** Plugins already receive `endpoint` and `model` through `endpointEnvironment` (OpenCode, Kimi, Qwen). Extend this with a declared plugin capability: which `api_format`s the plugin can consume, plus how it writes auth headers. The worker passes the resolved endpoint (URL, format, auth header name, secret value, extra headers, model) to the plugin.

- **OpenCode:** generate an `opencode.json` provider entry using `@ai-sdk/openai-compatible`, with `baseURL` and `headers`.
- **Pi:** generate `pi/models.json`.
- **Later, one plugin at a time:** Codex (`model_providers` in `config.toml` with `base_url`, `env_key` and `http_headers`), and Claude Code (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_CUSTOM_HEADERS`).
- The runner form offers an endpoint only to harnesses whose plugin declares that endpoint's `api_format`.

**Testing.** OVH AI Endpoints has a free anonymous tier. It is OpenAI-compatible at `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1` and fits the free-tier rule for harness test credentials.

**Exit:** an OpenCode runner and a Pi runner each complete a task against OVH AI Endpoints (Qwen3-Coder or gpt-oss), configured entirely through the generic form.

## Phase 2: Bedrock with the runner's AWS role

**Replaced (2026-10-06).** The worker's task role can read every secret under the SSM prefix and the uploads bucket, and agents run unsupervised on prompts built from ticket text. That is why the worker strips all `AWS_*` variables from agents. Handing them the task role would undo that. Bedrock is used through phase 1 instead: an endpoint with base URL `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`, Chat Completions, bearer auth with a Bedrock API key, and model IDs such as `openai.gpt-oss-120b`. Bedrock also serves `GET /models` there. If role-based access is wanted later, the safe shape is a separate Bedrock-only role, assumed by the worker and served to the agent as short-lived credentials from a local credential endpoint. The original design follows for reference.

A Bedrock API key needs nothing new: it is phase 1 with a bearer token. The task role is different because there is no secret to inject.

- Add a fourth auth scheme, `aws-role`, with a `region`. The form only offers it when the runner's compute is ECS or Lambda, and it is refused for Docker.
- This scheme bypasses the generic header path. A plugin declares native Bedrock support and receives the region:
  - **Claude Code:** `CLAUDE_CODE_USE_BEDROCK=1` and `AWS_REGION`.
  - **OpenCode:** its `amazon-bedrock` provider, which uses the AWS credential chain.
- Infrastructure: add `bedrock:InvokeModel*` to the worker task role in `infra/`, scoped to the configured model ARNs.

**Exit:** an ECS runner with no stored key completes a task on a Bedrock open-weight model, in an EU region if one serves it.

## Phase 3: Model deployments

**Cloud accounts.** These are new secret kinds on the Secrets page, which already holds non-model credentials:

- **Verda:** an OAuth client id and secret, exchanged at `POST /v1/oauth2/token` for a token that lasts one hour.
- **OVH:** an AI Deploy application token, or application key, application secret and consumer key for the OVH API (check which one AI Deploy app creation accepts).
- **Hugging Face token** (optional): needed for gated models.

**Catalog.** Read vLLM Recipes from its published JSON at runtime and cache it:

1. `/models.json`, then `/{hf_id}.json`
2. then `recommended_command.by_hardware[hw]`, then `/{hf_id}/hw/{hw}.json`

Show only hardware the target cloud offers. The single piece of cloud-specific data we maintain is a small map per adapter from recipe hardware names (`h100`, `l40s`, …) to cloud flavour ids. Everything else comes from upstream and stays current without our help. The generic form takes a Hugging Face id, a flavour, and extra `vllm serve` arguments.

Verda's own template API (`/v1/container-deployment-templates`, released 2026-09-14) is a possible second source for Verda only. It is left out at first so both clouds share one code path. Add it only if recipes miss models people want.

**Adapter.** Add a `ModelHost` interface in a `packages/model-hosting-<cloud>` extension package, following the extension pattern:

```
listFlavours(account)                     → id, GPU, VRAM, price/h if exposed
create(account, spec)                     → externalId, endpointUrl
getStatus(account, externalId)            → creating | idle | warming | running | stopped | failed
setReplicas(account, externalId, min, max)   // used by Keep warm (min 1), Scale to zero (min 0) and Stop (max 0, or pause)
delete(account, externalId)
```

Implementations: `VerdaContainersHost` and `OvhAiDeployHost`. They are wired in the composition root and chosen by the cloud account's kind, never with inline branching.

**Deployment spec.** Both adapters receive the same spec:

- the image `vllm/vllm-openai:<pinned tag>`
- `vllm serve` arguments from the recipe, with the recipe's tool-calling flags (`--enable-auto-tool-choice --tool-call-parser …`)
- `--api-key <generated>`, with the token stored as a platform-managed secret
- the Hugging Face token when needed
- the flavour
- replica bounds of 0 to 1 by default, and an idle window of 5–10 minutes

**Endpoint ownership.** Creating a deployment creates its model endpoint (`source = deployment`, `api_format = openai-chat`, `may_cold_start = true`). Runners select it exactly like a phase 1 endpoint. Deleting the deployment deletes the endpoint, and is refused while runners use it, the same way integrations behave today.

**State.** The cloud owns the truth. Viberglass reads status when someone views the deployment and before a job runs (phase 4). It doesn't run a background timer. A periodic status sync can be added later if the list view needs fresher data.

**UX.**

- The Model deployments page is admin-only, matching the other workspace plumbing.
- Each row shows: the model, the cloud, the flavour, the state ("Idle · scaled to zero", "Running", "Kept warm · €2.80/h", "Stopped"), and the runners that use it.
- Actions: Keep warm, Scale to zero, Stop, Delete. Keep warm shows the hourly price when the cloud exposes it.

**Exit:** a deployment created from a recipe on Verda, and one from the generic form on OVH, each serve an OpenCode task after a cold start, scale back to zero, and leave nothing billable after Delete.

## Phase 4: Cold-start handling

- When a job is queued against an endpoint with `may_cold_start`, the backend sends one wake request so the model boots while the worker starts.
- Before launching the harness, the worker polls `GET {base}/models` with the endpoint's auth until it returns 200, or until the timeout (15 min by default, set per deployment). It shows "Waking Qwen3-Coder on Verda…" in the job's progress.
- A deployment in `stopped` fails the job immediately with "Deployment is stopped. Start it or pick another endpoint." It doesn't wait.

**Exit:** a job against an idle deployment shows the waking step, then runs, with no harness-level timeout or retry noise.

## Phase 5 (deferred): Raw GPU VMs, EC2, SageMaker

Not planned. Revisit this only if one of these holds:

- a needed model can't run on the managed containers (unsupported engine, multi-node, special drivers), or
- sustained utilisation is high enough that VM pricing beats per-minute container billing.

Raw VMs bring their own lifecycle scheduler, a vLLM image, a startup script, TLS, an auth proxy, and orphan reconciliation. On AWS, check Bedrock Custom Model Import before EC2.

---

## Must verify before building

These are the facts the design depends on that the research didn't settle:

| Question | Affects | How to check |
|---|---|---|
| Does any request, including `GET /v1/models`, wake a Verda container scaled to zero? | Phase 4 | Small-flavour trial (pending a funded account) |
| Does OVH AI Deploy autoscaling scale **from** zero on incoming requests? The docs describe CPU, RAM or custom-metric triggers. | Phase 3, 4 | OVH docs and a trial app. If it can't, Keep warm/Stop becomes the only OVH mode. |
| Can AI Deploy apps be created through the OVH API, not only the CLI? Which credential does that need? | Phase 3 | OVH API console |
| Does Verda authenticate requests to the container itself? If it does, our `--api-key` is redundant. | Phase 3 | **Yes**, with the account's inference API key; `--api-key` is not used. |
| Is the vLLM Recipes JSON schema stable, and does every recipe include its tool-call parser? | Phase 3 | Read the repo's schema and recent changes |
| Which Bedrock open-weight models are served in EU regions? Does the OpenAI-compatible Bedrock endpoint accept both a Bedrock API key and SigV4? | Phase 1, 2 | AWS docs and an account check |
| Do OpenCode's `openai-compatible` provider and Pi's `models.json` both pass custom headers? | Phase 1 | Check the pinned harness versions, not the local images |

## Still open

- **Spend for testing.** Verda only, capped at €20 (2026-10-06). The account needs a positive balance before any deployment can be created.
- **Should Keep warm expire?** "Keep warm until 18:00" is convenient, but it is a timer, and timers are what this design avoids. Proposal: no expiry at first, and show the hourly price prominently.
- **Presets for the generic form.** A few prefill buttons (OVH AI Endpoints, Bedrock eu-central-1) would be data only. They are optional, but they partly reintroduce per-cloud entries.

## References

- Verda public API (deployment templates, container deployments, OAuth): https://api.datacrunch.io/v1/docs
- Verda: deploy with vLLM: https://docs.verda.com/containers/tutorials/deploy-with-vllm-quick/
- OVH AI Endpoints: https://www.ovhcloud.com/en/public-cloud/ai-endpoints/
- OVH AI Deploy scaling strategies: https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-deploy-apps-deployments
- OVH AI Deploy billing: https://docs.ovhcloud.com/en/guides/public-cloud/ai-machine-learning/ai-deploy-billing
- vLLM Recipes: https://github.com/vllm-project/recipes
- vLLM recipes tooling (JSON traversal): https://github.com/vllm-project/vllm/blob/main/tools/recipes/README.md
- Bedrock open-weight models (2026-02): https://aws.amazon.com/about-aws/whats-new/2026/02/amazon-bedrock-adds-support-six-open-weights-models
- Bedrock Custom Model Import cost: https://docs.aws.amazon.com/bedrock/latest/userguide/import-model-calculate-cost.html
