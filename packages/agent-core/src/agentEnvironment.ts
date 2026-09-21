/**
 * Deny-by-default environment for spawned agent CLIs.
 *
 * Agent CLIs run with their rails off (`--dangerously-skip-permissions`, `--yolo`,
 * auto-approved ACP permissions) on prompts built from attacker-influenceable ticket
 * text. Anything reachable in their environment is therefore reachable by an injected
 * instruction.
 *
 * The rule here is: the agent gets what it needs to talk to its model provider and
 * nothing else. The allowlist is explicit; the denylist is a second pass applied
 * afterwards so that an over-broad allowlist entry (or an operator-supplied
 * passthrough) still cannot smuggle a credential through.
 */

/**
 * Operator escape hatch, comma-separated. Set by the worker from clanker-config
 * `environment` keys so declared variables still reach the agent. Entries are
 * subject to the denylist below.
 */
export const AGENT_ENV_PASSTHROUGH_VAR = "VIBERGLASS_AGENT_ENV_PASSTHROUGH";

/** OS and language-runtime variables a CLI needs to start and behave sanely. */
const RUNTIME_ALLOWLIST: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PWD",
  "TMPDIR",
  "TMP",
  "TEMP",
  "TERM",
  "TZ",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "COLUMNS",
  "LINES",
  "LS_COLORS",
  // TLS trust material — omitting these breaks HTTPS in slim containers.
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
  "CURL_CA_BUNDLE",
  "REQUESTS_CA_BUNDLE",
  // Node/npm runtime knobs the harness CLIs are usually installed under.
  "NODE_ENV",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NPM_CONFIG_CACHE",
  "NPM_CONFIG_PREFIX",
  "NVM_DIR",
  "NVM_BIN",
  // Toolchain caches; absent these, agents write into unexpected places.
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "GOCACHE",
  "GOPATH",
  "CARGO_HOME",
  "RUSTUP_HOME",
  "PYTHONPATH",
  "PYTHONUNBUFFERED",
  "JAVA_HOME",
];

/**
 * Model-provider and harness variables. Explicit rather than prefix-matched where a
 * prefix would also cover unrelated cloud credentials (`GOOGLE_`, `AWS_`).
 */
const PROVIDER_ALLOWLIST: readonly string[] = [
  // Anthropic / Claude Code
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CLAUDE_CODE_NON_INTERACTIVE",
  "CLAUDE_CONFIG_DIR",
  // OpenAI / Codex
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "CODEX_AUTH_MODE",
  "CODEX_CONFIG_DIR",
  "CODEX_HOME",
  // Google / Gemini
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GOOGLE_API_KEY",
  "GOOGLE_GENAI_USE_VERTEXAI",
  // Alibaba / Qwen
  "DASHSCOPE_API_KEY",
  "QWEN_API_ENDPOINT",
  "QWEN_CLI_ENDPOINT",
  // Moonshot / Kimi
  "KIMI_API_KEY",
  "KIMI_BASE_URL",
  "KIMI_MODEL_NAME",
  // Mistral
  "MISTRAL_API_KEY",
  "MISTRAL_BASE_URL",
  // OpenCode
  "OPENCODE_BASE_URL",
  "OPENCODE_CONFIG_DIR",
  "OPENCODE_MODEL",
  // Pi
  "PI_CODING_AGENT_DIR",
];

/**
 * Applied last, over the allowlist and over operator passthrough. A variable matching
 * any of these never reaches an agent, whatever else says otherwise.
 *
 * `CODEX_AUTH_SECRET_NAME` is deliberately absent from the allowlist but present here
 * only by implication — it names a secret, and the CLI does not read it; the worker does.
 */
const DENY_PATTERNS: readonly RegExp[] = [
  // SCM credentials — the primary thing this function exists to withhold.
  /^(GITHUB|GH|GITLAB|BITBUCKET|GITEA)_(TOKEN|PAT|KEY|SECRET|PASSWORD|APP_PRIVATE_KEY)$/,
  /_?PERSONAL_ACCESS_TOKEN$/,
  // Cloud provider credentials and the metadata-endpoint plumbing around them.
  /^AWS_/,
  /^AZURE_/,
  /^GOOGLE_APPLICATION_CREDENTIALS$/,
  /^GCLOUD_/,
  /^ECS_CONTAINER_METADATA_URI(_V4)?$/,
  // Platform internals: database, queues, session and encryption material.
  /^(DATABASE|POSTGRES|PG|REDIS|MONGO)_/,
  /^DATABASE_URL$/,
  /_CONNECTION_STRING$/,
  /^WEBHOOK_SECRET/,
  /^JWT_/,
  /^SESSION_SECRET$/,
  /^ENCRYPTION_KEY$/,
  /^VIBERATOR_/,
  /^VIBERGLASS_/,
  /^PLATFORM_(API|BACKEND)_/,
  /^SECRETS_SSM_PREFIX$/,
  /^AUTH0_/,
  // Catch-all for credential-shaped names not enumerated above. Provider keys that
  // must survive this are on the allowlist and re-admitted before the denylist runs
  // only if they do not match here — so keep provider names out of these patterns.
  /(^|_)(CLIENT_SECRET|PRIVATE_KEY|CREDENTIALS|PASSWORD|PASSWD)$/,
];

export interface SanitizeAgentEnvironmentOptions {
  /**
   * Extra variable names to admit, beyond the built-in allowlist. Still filtered by
   * the denylist. Defaults to the contents of {@link AGENT_ENV_PASSTHROUGH_VAR}.
   */
  passthrough?: readonly string[];
}

export interface SanitizedAgentEnvironment {
  env: NodeJS.ProcessEnv;
  /** Names that were dropped, for logging. Never log the values. */
  removed: string[];
}

function parsePassthrough(env: NodeJS.ProcessEnv): string[] {
  return (env[AGENT_ENV_PASSTHROUGH_VAR] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function isDenied(name: string): boolean {
  return DENY_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Filter an environment down to what a spawned agent CLI is allowed to see.
 *
 * Deny-by-default: a name must be on the runtime allowlist, the provider allowlist or
 * the operator passthrough list, and must not match the denylist.
 */
export function sanitizeAgentEnvironment(
  source: NodeJS.ProcessEnv,
  options: SanitizeAgentEnvironmentOptions = {},
): SanitizedAgentEnvironment {
  const passthrough = options.passthrough ?? parsePassthrough(source);
  const allowed = new Set<string>([
    ...RUNTIME_ALLOWLIST,
    ...PROVIDER_ALLOWLIST,
    ...passthrough,
  ]);

  const env: NodeJS.ProcessEnv = {};
  const removed: string[] = [];

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    if (!allowed.has(name) || isDenied(name)) {
      removed.push(name);
      continue;
    }
    env[name] = value;
  }

  return { env, removed };
}

/** Exposed for tests and for documenting the boundary. */
export const agentEnvironmentAllowlist = {
  runtime: RUNTIME_ALLOWLIST,
  provider: PROVIDER_ALLOWLIST,
  denyPatterns: DENY_PATTERNS,
};
