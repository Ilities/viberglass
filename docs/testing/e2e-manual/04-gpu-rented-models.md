# 04 · Rented GPU models

An open-weight model served from a GPU you rent, used by agents through a workspace model endpoint. Viberglass can't create or manage GPU deployments yet (the "model deployments" phase of [../../model-hosting-plan.md](../../model-hosting-plan.md) isn't built), so you set the server up by hand and point an endpoint at it. Bedrock role auth isn't built either.

**Stop or delete the GPU when you finish.** A running GPU bills by the hour.

## Contents

- [Choosing a model and a provider](#choosing-a-model-and-a-provider)
- [Tests (GPU)](#tests-gpu)
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
1. Runner form (OpenCode) → **Add endpoint**: base URL `https://<gpu-url>/v1`, Chat Completions, bearer, the vLLM key; tick **may cold start** if the deployment scales to zero. **Check**.

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
1. Create a Bedrock API key; add an endpoint with Bedrock's OpenAI-compatible base URL for your region, bearer auth.
2. Run a task on OpenCode.

Expect: if it works, record it as the first validation of this path; it hasn't been tested.

### GPU-07 · Cleanup
1. Stop or delete the GPU deployment; delete the endpoint (detach it from runners first).

Expect: no running GPU left in the provider console.

## Not available yet

Mark these `n/a`: Viberglass-created GPU deployments (Verda containers, OVH AI Deploy), keep-warm/stop controls, the job waking a stopped deployment, Bedrock SigV4 with the ECS task role.
