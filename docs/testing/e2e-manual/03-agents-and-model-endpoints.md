# 03 · Agent harnesses and model endpoints

Every harness with whatever credentials are available, and workspace model endpoints in all their configurations. Run on **L-REV** unless noted. A local OpenAI-compatible server is useful for the endpoint tests; [Ollama](https://ollama.com) is the simplest.

## Contents

- [Harness matrix (HARN)](#harness-matrix-harn)
- [Model endpoints (EP)](#model-endpoints-ep)
- [A local model server](#a-local-model-server)

## Harness matrix (HARN)

For each row, run the **harness script** below on a fresh task and record each step's result in the log as `HARN-<row>.<step>`.

**Harness script**
1. **Research:** ask the runner for research (mention it once so it's on the task, then **Write the research**). A Research version appears.
2. **Continue:** ask a follow-up. The turn says "continued its session" where the harness supports resuming.
3. **Question:** ask it to use ask_human (blocking); answer; it carries on.
4. **Code:** **Build it** on a writable repo (or expect "Couldn't push changes" on the L-REV fixture).
5. **Cancel:** start a turn and cancel it. The container stops and partial work is kept.
6. **Records:** Run records shows harness, requested model, and reported model or "model not reported".

| Row | Harness | Credentials and configuration | Notes from the v1 review |
|---|---|---|---|
| 1 | Claude Code | z.ai Anthropic endpoint (`https://api.z.ai/api/anthropic`) via the runner's base-URL variable, GLM key | Worked end to end |
| 2 | Claude Code | Native Anthropic key | Optional; not yet validated |
| 3 | OpenCode | OpenCode Go key (native provider) | Setup default |
| 4 | OpenCode | z.ai via a workspace model endpoint (Chat Completions) | See EP tests |
| 5 | Pi | Model endpoint, Chat Completions | Returned empty research before UX-01; should now fail visibly if still empty |
| 6 | Pi | Model endpoint, Anthropic Messages | |
| 7 | Qwen CLI | z.ai OpenAI-compatible endpoint | Failed with "Internal error"; record whether it still does |
| 8 | Codex | API key mode with z.ai Responses endpoint | Failed "Authentication required"; now classified as Model key rejected |
| 9 | Codex | ChatGPT login (RUNNER-03) | Optional |
| 10 | Kimi Code | z.ai base URL and model | Failed "Authentication required" |
| 11 | Kimi Code | Native Moonshot key | Optional |
| 12 | Antigravity | Native Gemini key | Optional; no endpoint path |
| 13 | Mistral Vibe | Native Mistral key | Optional; no endpoint path |
| 14 | Fake | `FAKE_API_KEY` secret | Deterministic; good for compute and deployment tests |

## Model endpoints (EP)

Endpoints are created inline: the runner form's **Add endpoint** (OpenCode and Pi only), or first-run setup (SETUP-02).

### EP-01 · Create and discover
1. Runner form → OpenCode → **Add endpoint**: name, base URL, API Chat Completions, bearer auth, new key, **Check**.

Expect: models discovered from `GET /models`; saved; offered to any OpenCode or Pi runner.

### EP-02 · No model listing
Needs: a server without `/models` (or a proxy returning 404 there).
1. Check, then type the model ID by hand and save.

Expect: "Model discovery is unavailable" and the typed model kept.

### EP-03 · Wrong key, redirect
1. Check with a wrong key.
2. Use a base URL that redirects (e.g. `http://` to `https://`).

Expect: (1) rejected with the HTTP status. (2) Refused (redirects are never followed).

### EP-04 · Header auth and extra headers
1. Auth "Header" with `x-api-key`; add a non-secret extra header (`X-Test: 1`). Run a task; check the server's access log.

Expect: the key arrives in the named header; the extra header is sent; the auth header wins over an extra header of the same name.

### EP-05 · Format compatibility
1. Create an Anthropic Messages endpoint.
2. Open an OpenCode runner, then a Pi runner, then a Claude Code runner.

Expect: only Pi offers it; Claude Code says it uses only its own providers.

### EP-06 · In-use protection and stale readiness
1. Try deleting an endpoint a runner uses, and its secret.
2. Edit the endpoint's key after a failed run.

Expect: (1) refused. (2) The runner's "Key rejected" readiness clears.

### EP-07 · Cold start
Needs: a local server you can stop.
1. Endpoint with **may cold start** ticked. Stop the server; start a task on a runner using it.
2. Start the server within a few minutes.
3. Repeat with a wrong key.

Expect: (1) the run shows "Waking <model> on <name>…". (2) It continues once the server answers. (3) Fails at once with 401/403. The 15-minute timeout is covered by the worker's unit test.

### EP-08 · Two runners, one endpoint
1. Use the same endpoint on an OpenCode and a Pi runner; run tasks on both at once.

Expect: both work; changing the endpoint affects both.

## A local model server

Ollama with a tool-calling model is enough for EP tests (agent quality will be modest):

```bash
ollama serve &
ollama pull qwen2.5-coder:7b
# Base URL for workers in Docker: http://host.docker.internal:11434/v1  (auth: none)
```

Any OpenAI-compatible server works (LM Studio, llama.cpp server, vLLM). Workers run in Docker, so use `host.docker.internal`, not `localhost`.
