# 04 · Rented GPU models

An open-weight model served from a GPU you rent, used by agents through a workspace model endpoint. Viberglass deploys models to Verda itself ([Viberglass-created deployments](#viberglass-created-deployments-verda)); for any other provider you set the server up by hand and point an endpoint at it ([Tests (GPU)](#tests-gpu)). Background: [../../model-hosting-plan.md](../../model-hosting-plan.md).

**Stop or delete the GPU when you finish.** A running GPU bills by the hour.

## Contents

- [Choosing a model and a provider](#choosing-a-model-and-a-provider)
- [Tests (GPU)](#tests-gpu)
- [Viberglass-created deployments (Verda)](#viberglass-created-deployments-verda)
- [Not available yet](#not-available-yet)

## Choosing a model and a provider

- **Model:** a coding model with tool calling that fits the GPU, e.g. `Qwen/Qwen2.5-Coder-32B-Instruct` (≈80 GB at full precision; an AWQ/FP8 build fits 48 GB) or `Qwen/Qwen2.5-Coder-7B-Instruct` on a 24 GB card for a cheap first pass.
- **Provider:** whatever you have an account with: Verda (Finland), OVHcloud AI Deploy (France; can scale to zero), RunPod, Lambda Labs. What matters is an HTTPS URL reachable from where the workers run.
- **Server:** vLLM's OpenAI-compatible server with tool calling switched on:

```bash
vllm serve Qwen/Qwen2.5-Coder-7B-Instruct \
  --api-key "$VLLM_API_KEY" \
  --enable-auto-tool-choice --tool-call-parser hermes \
  --max-model-len 32768
```

Most providers offer a vLLM image; use the same flags.

## Tests (GPU)

### GPU-01 · Server reachable
1. `curl -H "Authorization: Bearer $VLLM_API_KEY" https://<gpu-url>/v1/models`.

Expect: the model listed.

### GPU-02 · Endpoint on the GPU
1. Settings → Models → Connect a model (or the runner form's Connect a model): base URL `https://<gpu-url>/v1`, Chat Completions, bearer, the vLLM key; tick **may cold start** if the deployment scales to zero. **Check**.

Expect: the model is discovered; the endpoint saved.

### GPU-03 · Agent work on OpenCode and Pi
1. Run the [harness script](03-agents-and-model-endpoints.md#harness-matrix-harn) steps 1–4 with an OpenCode runner and a Pi runner on the endpoint.

Expect: research, a follow-up, a question and a build all complete. Record quality issues (tool-call errors, truncation at Pi's 32k context) separately from failures.

### GPU-04 · Cold start
Needs: a scale-to-zero deployment (OVH AI Deploy with minimum replicas 0), or stop the server by hand.
1. Let it scale to zero; start a task.

Expect: "Waking …" progress until the model answers, then the run continues. Record the wake time. A wake longer than 15 minutes fails the run.

### GPU-05 · Concurrency and data residency
1. Start two tasks on the endpoint at once.
2. Check the provider's region matches what you expect (e.g. EU).

Expect: both complete; record throughput and whether the GPU queued requests.

### GPU-06 · Bedrock through an API key (optional)
1. Create a Bedrock API key; add an endpoint with base URL `https://bedrock-runtime.<region>.amazonaws.com/openai/v1`, Chat Completions, bearer auth with the key. **Check** should discover models; otherwise type one, e.g. `openai.gpt-oss-120b`.
2. Run a task on OpenCode.

Expect: if it works, record it as the first validation of this path; it hasn't been tested.

### GPU-07 · Cleanup
1. Stop or delete the GPU deployment; delete the endpoint (detach it from runners first).

Expect: no running GPU left in the provider console.

## Viberglass-created deployments (Verda)

Needs: a Verda account **with a positive balance**, a Cloud API credential (client ID and secret) and an Inference API key, both from Keys in the Verda console. A cheap first pass: `Qwen/Qwen3-8B` on one L40S (€1.52/h) through **Any Hugging Face model**, with the default serving arguments.

### DEP-01 · Cloud account
1. Settings → Secrets → Cloud accounts → **Add account**; enter the client ID, client secret and inference key.

Expect: the account is listed with its client ID; none of its credentials appear under Model keys or Other secrets.

### DEP-02 · Deploy from a recipe
1. Settings → Models → Deployed models → **Deploy a model**; pick the account, **From vLLM Recipes**, a model such as `openai/gpt-oss-20b`.

Expect: the GPU list holds only GPUs the recipe lists (H100, H200…), with prices; picking one fills the serving arguments, including the tool-call parser.

### DEP-03 · Deploy any model and wait for the first start
1. Deploy `Qwen/Qwen3-8B` on L40S through **Any Hugging Face model**.
2. Watch the row; the page refreshes itself while it starts.

Expect: the row goes from Creating to Idle · scaled to zero; the Verda console shows the deployment with 0–1 replicas.

### DEP-04 · A run wakes the deployment
1. Point an OpenCode runner at the deployment's endpoint (Model section → Workspace models).
2. Start a research task while the deployment is idle.

Expect: the run shows "Waking …", then completes; the row shows Running during the run and Idle again about five minutes after. Record the wake time.

If the run never wakes, open the deployment's Logs in the Verda console. Replicas that restart every few minutes mean the server crashes on start; the cause is the last Python error before `Engine core initialization failed`. Delete the deployment: Verda bills the GPU while it restarts.

### DEP-05 · Keep warm, stop, start
1. Change the mode to **Keep warm**; then **Stop**; start a task on the runner; then **Start**.

Expect: Keep warm shows the hourly price and a replica stays up. While stopped, the task fails at once with "<name> is stopped. Start it or pick another endpoint." Start returns it to scale-to-zero.

### DEP-06 · Delete
1. Try deleting while the runner uses it; move the runner to another model; delete.

Expect: the first attempt is refused, naming the runner. The second can take about a minute. After deletion, the Verda console shows no deployment and no `*-hf-token` secret, and the endpoint is gone from the runner form.

## Not available yet

Mark these `n/a`: OVH AI Deploy deployments, Bedrock with the ECS task role (replaced by GPU-06).
