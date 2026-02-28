import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import { AgentConfigFileManager } from "./AgentConfigFileManager";

describe("AgentConfigFileManager.materialize", () => {
  function createManager() {
    return new AgentConfigFileManager(
      createLogger({
        level: "error",
        transports: [new transports.Console({ silent: true })],
      }),
    );
  }

  test("materializes codex config under a CODEX_HOME directory", async () => {
    const manager = createManager();
    const jobWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-config-"));
    const repoDir = path.join(jobWorkDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      const result = await manager.materialize(jobWorkDir, repoDir, "codex", {
        fileType: ".codex/config.toml",
        content: 'model = "gpt-5-codex"',
      });

      expect(result.environment).toEqual({
        CODEX_HOME: path.join(jobWorkDir, ".codex"),
      });
      expect(
        fs.readFileSync(path.join(jobWorkDir, ".codex", "config.toml"), "utf-8"),
      ).toBe('model = "gpt-5-codex"');
    } finally {
      fs.rmSync(jobWorkDir, { recursive: true, force: true });
    }
  });

  test("materializes opencode config in the repo and exports OPENCODE_CONFIG", async () => {
    const manager = createManager();
    const jobWorkDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-config-"));
    const repoDir = path.join(jobWorkDir, "repo");
    fs.mkdirSync(repoDir, { recursive: true });

    try {
      const result = await manager.materialize(jobWorkDir, repoDir, "opencode", {
        fileType: "config/opencode.json",
        content: '{ "model": "gpt-5" }',
      });

      const targetPath = path.join(repoDir, "config", "opencode.json");
      expect(result.environment).toEqual({
        OPENCODE_CONFIG: targetPath,
      });
      expect(fs.readFileSync(targetPath, "utf-8")).toBe('{ "model": "gpt-5" }');
    } finally {
      fs.rmSync(jobWorkDir, { recursive: true, force: true });
    }
  });
});
