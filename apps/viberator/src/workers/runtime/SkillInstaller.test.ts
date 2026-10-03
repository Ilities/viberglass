import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger, transports } from "winston";
import { SkillInstaller } from "./SkillInstaller";

const logger = createLogger({ transports: [new transports.Console({ silent: true })] });
const b64 = (text: string) => Buffer.from(text).toString("base64");

describe("SkillInstaller", () => {
  let home: string;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const files = {
    "skill-a": [
      { path: "SKILL.md", contentBase64: b64("---\nname: skill-a\n---") },
      { path: "scripts/run.sh", contentBase64: b64("echo hi") },
    ],
    "skill-b": [{ path: "SKILL.md", contentBase64: b64("b") }],
  };
  const installer = new SkillInstaller(async (id) => files[id as keyof typeof files], logger);

  it("writes each skill into every folder the harness reads", async () => {
    await installer.install([{ id: "skill-a", name: "skill-a" }], home, [".agents/skills", ".claude/skills"]);
    for (const dir of [".agents/skills", ".claude/skills"]) {
      expect(fs.readFileSync(path.join(home, dir, "skill-a", "scripts/run.sh"), "utf8")).toBe("echo hi");
    }
  });

  it("removes skills it installed before, and leaves other folders alone", async () => {
    fs.mkdirSync(path.join(home, ".agents/skills/someone-elses"), { recursive: true });
    await installer.install([{ id: "skill-a", name: "skill-a" }], home, [".agents/skills"]);
    await installer.install([{ id: "skill-b", name: "skill-b" }], home, [".agents/skills"]);
    const root = path.join(home, ".agents/skills");
    expect(fs.existsSync(path.join(root, "skill-a"))).toBe(false);
    expect(fs.existsSync(path.join(root, "skill-b", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "someone-elses"))).toBe(true);
  });

  it("skips files whose path would leave the skill's folder", async () => {
    const escaping = new SkillInstaller(async () => [{ path: "../../evil", contentBase64: b64("x") }], logger);
    await escaping.install([{ id: "x", name: "x" }], home, [".agents/skills"]);
    expect(fs.existsSync(path.join(home, ".agents/evil"))).toBe(false);
    expect(fs.existsSync(path.join(home, "evil"))).toBe(false);
  });
});
