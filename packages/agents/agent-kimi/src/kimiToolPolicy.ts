import * as fs from "fs";
import * as path from "path";

/**
 * Kimi Code's own question tool reaches a worker as a permission request,
 * which the worker approves with the first answer as if a person had chosen
 * it. Without it, the agent asks people through the worker's MCP server.
 */
export const KIMI_TOOLS_SECTION = [`[tools]`, `disabled = ["AskUserQuestion"]`, ``].join("\n");

/** Adds the tools section to Kimi Code's config, unless the config already has one. */
export function writeKimiToolPolicy(homeDir: string): void {
  const dir = path.join(homeDir, ".kimi-code");
  const file = path.join(dir, "config.toml");
  const config = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  if (/^\s*\[tools\]/m.test(config)) return;
  fs.mkdirSync(dir, { recursive: true });
  const separator = config && !config.endsWith("\n") ? "\n\n" : config ? "\n" : "";
  fs.writeFileSync(file, `${config}${separator}${KIMI_TOOLS_SECTION}`, { mode: 0o600 });
}
