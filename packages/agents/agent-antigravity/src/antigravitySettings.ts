import * as fs from "fs";
import * as path from "path";

/** `$HOME`-relative directory holding the ACP server's settings and conversations. */
export const ANTIGRAVITY_STATE_DIR = ".gemini/antigravity-acp";

/**
 * Selects Gemini API key auth in the ACP server's settings.json. The server
 * reads the auth method only from this file (or an `authenticate` call, which
 * the worker never makes), so without it every `session/new` is refused.
 */
export function writeApiKeyAuthSettings(home: string): void {
  const dir = path.join(home, ANTIGRAVITY_STATE_DIR);
  const file = path.join(dir, "settings.json");
  const settings = readSettings(file);
  settings.auth = { type: "gemini-api-key" };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
}

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
