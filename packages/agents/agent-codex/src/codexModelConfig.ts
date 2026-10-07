import * as fs from "fs";
import * as path from "path";
import { tomlInlineTable, tomlString } from "@viberglass/agent-core";
import { MODEL_ENDPOINT_KEY_ENV_VAR, type WorkerModelEndpoint } from "@viberglass/types";

const PROVIDER = "viberglass";

/**
 * Codex config that runs the endpoint's model. Codex reads the key from the environment
 * itself, as a bearer token or as any header, so the file holds no secret. It has to be
 * Codex's own config file: codex-acp decides whether to ask for a login from that, not
 * from the session config it passes along.
 */
export function codexModelConfig(endpoint: WorkerModelEndpoint): string {
  const auth =
    endpoint.auth.scheme === "bearer"
      ? [`env_key = ${tomlString(MODEL_ENDPOINT_KEY_ENV_VAR)}`]
      : endpoint.auth.scheme === "header"
        ? [`env_http_headers = ${tomlInlineTable({ [endpoint.auth.header]: MODEL_ENDPOINT_KEY_ENV_VAR })}`]
        : [];
  return [
    `model = ${tomlString(endpoint.model)}`,
    `model_provider = ${tomlString(PROVIDER)}`,
    `model_context_window = 32768`,
    ``,
    `[model_providers.${PROVIDER}]`,
    `name = ${tomlString(endpoint.name)}`,
    `base_url = ${tomlString(endpoint.baseUrl)}`,
    `wire_api = "responses"`,
    `supports_websockets = false`,
    `http_headers = ${tomlInlineTable(endpoint.extraHeaders)}`,
    ...auth,
    ``,
  ].join("\n");
}

/** Replaces Codex's config.toml, which runs never keep. */
export function writeCodexModelConfig(endpoint: WorkerModelEndpoint, codexHome: string): void {
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), codexModelConfig(endpoint), { mode: 0o600 });
}
