import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import { InstructionFileManager } from "./InstructionFileManager";

describe("InstructionFileManager.materialize", () => {
  test("stores clanker AGENTS file under agents/ without overwriting repo AGENTS.md", async () => {
    const logger = createLogger({
      level: "error",
      transports: [new transports.Console({ silent: true })],
    });
    const manager = new InstructionFileManager(logger);

    const repoDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "instruction-file-manager-"),
    );

    try {
      fs.mkdirSync(path.join(repoDir, ".git", "info"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, ".git", "info", "exclude"), "");
      fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "repo-instructions");

      const files = new Map<string, string>([
        ["AGENTS.md", "clanker-instructions"],
        ["../outside.txt", "blocked-content"],
      ]);

      await manager.materialize(repoDir, files);

      expect(
        fs.existsSync(path.join(repoDir, "agents", "AGENTS.md")),
      ).toBe(true);
      expect(
        fs.readFileSync(path.join(repoDir, "agents", "AGENTS.md"), "utf-8"),
      ).toBe("clanker-instructions");
      expect(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf-8")).toBe(
        "repo-instructions",
      );
      expect(fs.existsSync(path.join(repoDir, "outside.txt"))).toBe(true);
      expect(fs.existsSync(path.join(path.dirname(repoDir), "outside.txt"))).toBe(
        false,
      );

      const excludeFile = fs.readFileSync(
        path.join(repoDir, ".git", "info", "exclude"),
        "utf-8",
      );
      expect(excludeFile).toContain("agents/AGENTS.md");
      expect(excludeFile).toContain("outside.txt");
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
