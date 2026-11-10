import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { claudeConfigDirectory, writeClaudeCodeSettings } from "../src/claudeCodeSettings";

describe("Claude Code run settings", () => {
  let dir: string;
  const settingsFile = () => path.join(dir, "settings.json");
  const written = () => JSON.parse(fs.readFileSync(settingsFile(), "utf8"));

  beforeEach(() => {
    dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "claude-settings-")), ".claude");
  });

  afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));

  test("skips permission checks without auto mode's classifier, and leaves out Claude Code's attribution", () => {
    writeClaudeCodeSettings(dir);
    expect(written()).toEqual({
      permissions: { defaultMode: "bypassPermissions", disableAutoMode: "disable" },
      attribution: { commit: "", pr: "" },
    });
  });

  test("keeps the settings already there, the permission rules among them", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({ model: "sonnet", permissions: { defaultMode: "auto", allow: ["Bash(npm test)"] }, attribution: { commit: "Made by me" } }),
    );
    writeClaudeCodeSettings(dir);
    expect(written()).toEqual({
      model: "sonnet",
      permissions: { defaultMode: "bypassPermissions", disableAutoMode: "disable", allow: ["Bash(npm test)"] },
      attribution: { commit: "", pr: "" },
    });
  });

  test("replaces a settings file it can't read", () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsFile(), "{ not json");
    writeClaudeCodeSettings(dir);
    expect(written().permissions.defaultMode).toBe("bypassPermissions");
  });

  test("uses CLAUDE_CONFIG_DIR when it is set, else .claude in the home directory", () => {
    expect(claudeConfigDirectory({ CLAUDE_CONFIG_DIR: "/srv/claude" }, "/home/viberator")).toBe("/srv/claude");
    expect(claudeConfigDirectory({}, "/home/viberator")).toBe("/home/viberator/.claude");
  });
});
