import * as fs from "fs";
import * as path from "path";

type Settings = Record<string, unknown>;

function isRecord(value: unknown): value is Settings {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * What a worker run needs from Claude Code: every tool call allowed without
 * asking, since nobody is there to answer and the run is confined to its
 * worker. Auto mode is off because it asks an Anthropic classifier model about
 * each call, which a custom endpoint doesn't serve; with it off, a session
 * continued from auto mode starts in this mode too. Attribution is off so commits and pull requests carry no Claude Code lines.
 */
export function withRunSettings(settings: Settings): Settings {
  const permissions = isRecord(settings.permissions) ? settings.permissions : {};
  return {
    ...settings,
    permissions: { ...permissions, defaultMode: "bypassPermissions", disableAutoMode: "disable" },
    attribution: { commit: "", pr: "" },
  };
}

function readSettings(file: string): Settings {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Adds the run's settings to the user settings in Claude Code's config directory, keeping the rest. */
export function writeClaudeCodeSettings(configDir: string): void {
  const file = path.join(configDir, "settings.json");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(withRunSettings(readSettings(file)), null, 2)}\n`);
}

/** Where Claude Code reads its user settings, as claude-agent-acp resolves it. */
export function claudeConfigDirectory(env: NodeJS.ProcessEnv, home: string): string {
  return env.CLAUDE_CONFIG_DIR || path.join(home, ".claude");
}
