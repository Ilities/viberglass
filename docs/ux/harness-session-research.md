# Can harnesses hold a conversation across turns? (S2 research)

Status: **research done, 2026-10-01** · For: S2 in [`task-conversation-handover.md`](./task-conversation-handover.md) · Decision it serves: [ADR 0008](../adr/0008-tasks-are-conversations.md)

ADR 0008 needs each task to be one long conversation with an agent. Each turn runs as its own job in a fresh container. Between turns the worker archives the harness's state directory, and the next turn restores it and calls ACP `session/load`. This checks whether that actually works, harness by harness.

## 1. Method

**Probes.** A small ACP client (`/tmp/acp-probe/probe.mjs`, local, not committed) ran against the worker images:
- `viberator-worker-opencode:latest` (local build);
- `ghcr.io/ilities/viberator-worker-{multi-agent,codex,mistral}:latest` (published);
- a throwaway image adding the current Claude adapter.

`initialize` and `session/new` needed no model.

**Two-turn test** (`/tmp/acp-probe/twoturn.sh`, local, with real models on the GLM coding plan, Jussi's key, since deleted):
1. Turn 1, in container A, tells the agent a codeword.
2. Only the harness's state directories are archived.
3. Turn 2, in a new container B with the state restored, calls `session/load` (`session/resume` for DeepSeek Harness) and asks for the codeword.
4. Then it sends `/compact <instructions>` and asks again.

Each harness ran twice: with turn 2 in the **same** working directory as turn 1, and in a **different** one, which is what the worker does today (`/tmp/viberator-work/<jobId>/repo`). The repo was identical in both containers, down to the commit hash.

**Desk research:** the ACP spec at schema 1.10.2, and the adapters' source.

## 2. Results

| Harness | Advertises | Same directory | Different directory | `/compact` | Usage reported |
|---|---|---|---|---|---|
| **Claude Code** (`@agentclientprotocol/claude-agent-acp` 0.85.0, on GLM through Z.ai's Anthropic endpoint) | load, resume, list, fork, close, delete | ✅ replayed history, recalled the codeword | ✅ also worked | ✅ compacted, then still recalled it | `usage_update`, and per-turn usage in the prompt response |
| **opencode** 1.18.32 (GLM coding plan) | load, resume, list, fork, close | ✅ | ❌ load "succeeds", then every prompt fails with "OpenCode service failure" | ✅ wrote a structured summary, then recalled the codeword | `usage_update`, and per-turn usage |
| **qwen** 0.24.4 (GLM through Z.ai's OpenAI-compatible endpoint) | load, resume, list | ✅ | ❌ "Resource not found"; the cold session didn't know the codeword | Its command is `/compress` (`/compact` was read as plain text) | `usage_update` |
| **pi** (`@earendil-works/pi-coding-agent` 0.99.2, `pi-acp` 0.0.34, native `zai` provider, `glm-5.3`) | load, list, delete | ✅ | ❌ load fails ("Internal error"); cold session didn't know the codeword | ✅ command exists (refused: "session too small") | `usage_update` |
| **DeepSeek Harness** (`@deepseek-ai/dsh` 0.2.0-rc.2, `dsh --profile acp`, custom `zai-coding` provider on Z.ai's OpenAI-compatible endpoint, `glm-5.3`) | **resume only** (no load), list, close | ✅ via `session/resume`, no replay | ❌ "session cwd does not match" | No command; answers it as a message | `usage_update` |
| **Z.ai GLM agent** (community `glm-acp-agent` 1.13.0, `glm-5.3`) | load, resume, list, fork, close | ✅ | ✅ also worked | No command (compacts on its own) | Per-turn usage in the prompt response, no `usage_update` |
| **Antigravity** (Google `antigravity-acp` 1.2.1) | load, resume, list | not run (no key) | — | — | — |
| **Mistral Vibe** 2.25.8 | load, list, fork, close | not run (needs a Mistral key) | — | `/compact` (source) | `usage_update` (source) |
| **Codex** | (upstream: load, resume, list) | **broken image**: no `codex-acp` in it | — | `/compact` without instructions; prompt set in config | `usage_update` (source) |
| **Kimi** | — | **broken image**: kimi-cli 1.52.0 refuses to run ("no longer maintained, use Kimi Code CLI") | — | — | — |
| Gemini | load only | skipped: being replaced (Jussi) | — | — | — |

**Notes on the newer harnesses:**
- **Antigravity** advertises `gemini-api-key` among its sign-ins (with `oauth-personal`, `oauth-business` and `agent-platform`), so a free AI Studio key may be enough to test it. Google says driving its *login* from third-party software breaks its terms; an API key doesn't. It isn't an npm package: the ACP server is a separate download from `dl.google.com/agy-extensions/…`.
- **DeepSeek Harness** uploads session logs to DeepSeek by default, but only when it uses DeepSeek's own API. A plugin should turn that off explicitly. Its built-in `zai` provider name isn't registered in ACP mode ("no adapter registered"), so Z.ai needs a custom provider in `~/.dsh/cordis.patch.yml`. It's a developer preview.
- **Z.ai** has no official ACP harness: its ZCode CLI speaks its own protocol and is shipped as a desktop app. `glm-acp-agent` is a community project; it worked best of all here, but it's one maintainer's code.
- **pi-acp** prefixes the first reply with a "pi v0.99.2 ---" banner (`quietStartup: true` in pi's settings should drop it).

**Cost of a turn:** Claude Code spent about 16–19k input tokens to answer "OK" (its system prompt), opencode about 5–6k, the GLM agent about 2.4k. A resumed turn reuses the harness's cache; a cold one pays this again plus the task's context.

## 3. What's wrong today, and the fix

1. **The working directory changes every turn.** It's `/tmp/viberator-work/<jobId>/repo`. qwen, pi and DeepSeek Harness can't find the session, and opencode can't use it; kimi and gemini key sessions by path too. Only Claude Code and the GLM agent coped.

   **Fix:** clone every turn of a task into the same path, e.g. `/tmp/viberator-work/task-<taskId>/repo`, and send that path as `cwd` on load. Each container is fresh, so there's no clash.
2. **Archived directories are wrong for opencode and Codex, and incomplete for pi.**

   | Harness | Archived today | Should archive |
   |---|---|---|
   | opencode | `~/.opencode`, which doesn't exist | `~/.local/share/opencode` (or set `OPENCODE_DB`). So opencode has never resumed: the load fails and `AcpClient` silently starts a new session |
   | Codex | `.codex` | `$CODEX_HOME`, set to `/tmp/codex-config` in its image, including its SQLite files |
   | pi | — | `~/.pi/agent/sessions` and `~/.pi/pi-acp/session-map.json` |
   | Claude Code | `.claude` | `.claude` (correct) |
   | qwen | `.qwen` | `.qwen` (correct) |
3. **Stale or missing packages in the worker images:**
   - Claude adapter: `@zed-industries/claude-agent-acp` is frozen at 0.23.1. Use `@agentclientprotocol/claude-agent-acp`. The published multi-agent image has no Claude Code at all.
   - Codex image: lacks `codex-acp`. It's now `@agentclientprotocol/codex-acp`.
   - Kimi: the CLI is end-of-life. Move to Kimi Code CLI, or drop the harness.
   - pi: install `@earendil-works/pi-coding-agent` ≥ 0.81 instead of `@mariozechner/pi-coding-agent`.
4. **Nobody can tell whether a turn resumed.** `AcpClient` tries `session/load`, falls back to `session/new` on any error, and doesn't check `loadSession` first. opencode in a different directory shows a load can even "succeed" and then fail on the prompt.

   **Fix:**
   - Check the capability.
   - Prefer `session/resume` where it's advertised, since we don't need history replayed: the thread is ours.
   - Treat any load error, or a failed first prompt after load, as cold.
   - Report `resumed: true | false` with the turn, so the thread shows it and costs make sense.
5. **Restored state can carry stale credentials** (`~/.local/share/opencode/auth.json`, `~/.claude/.credentials.json`, `~/.kimi/credentials/`). The archives in these tests didn't contain the key, because it came through env and config. Still, exclude credential files from archives, or let freshly injected credentials win.

## 4. What this means for S2's design

- **Resuming is feasible** for Claude Code, opencode, qwen, pi, DeepSeek Harness and the Z.ai GLM agent (all tested with real models) once fixes 1 and 2 are in, and probably for Vibe and Codex once their images are fixed. DeepSeek Harness only offers `session/resume`, which is one more reason to prefer it over `load`. So the delta-prompt design holds: a resumed turn sends only what's new.
- **Compaction with our prompt is a prompt turn:**
  - `/compact <instructions>` on Claude Code, opencode, pi, Vibe and Kimi;
  - `/compress <instructions>` on qwen;
  - for Codex, `compact_prompt` in its config;
  - DeepSeek Harness and the GLM agent have no command. Asking for a summary works as an ordinary turn, but doesn't shrink the harness's context. We'd post that summary and start the next turn cold from it when the context is full.

  Which command a harness has comes from `available_commands_update` at session start, so the plugin doesn't need to hard-code it. The summary the harness returns is what we post in the thread (ADR 0008).
- **The context threshold for automatic compaction** comes from `usage_update` (`used` and `size` tokens), which every working harness sends.
- **Cold starts stay necessary.** They happen when a second harness is brought in, when the archive is lost, or when a harness can't resume. The cold-start preamble (summary plus current artifacts) is the fallback path, and these tests show it's what qwen and opencode get today without anyone knowing.
- **Plugins should declare where their state lives**, as a list of directories rather than one `stateDir`, plus which files to leave out. They'd keep the capability flags from the build plan (`resumesSessions`, and the compact command if `available_commands_update` isn't enough).

## 5. S2's first steps, from this

Steps 1–4 landed on 2026-10-01; see the build plan's S2 section.

1. **Stable working directory per task** in the worker (fix 1), with a unit test of the path.
2. **Correct state directories** per plugin (fix 2): `stateDirs: string[]` and `stateExcludes`, with opencode, Codex and pi corrected.
3. **`AcpClient`:** check the capability, prefer `resume`, detect cold starts, report `resumed` (fix 4), and capture `usage_update`.
4. **Image fixes** (fix 3) as their own change: the Claude adapter rename, `codex-acp`, pi's package, and a decision on Kimi.
5. **New harnesses** (Jussi, 2026-10-01: pi, Antigravity, DeepSeek, Z.ai), as plugins once the fixes above are in. Each needs its state directories, its resume verb (`resume` for DeepSeek Harness) and its provider setup.
6. **A resume journey** on the fake agent (two turns across worker containers; the fake keeps per-session memory in its state directory), plus a manual check like this one on one real harness before S2 ships.
