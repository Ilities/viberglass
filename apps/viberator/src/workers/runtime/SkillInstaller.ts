import * as fs from "fs";
import * as path from "path";
import type { Logger } from "winston";
import type { SkillFile, WorkerSkill } from "@viberglass/types";

export type SkillFetcher = (skillId: string) => Promise<SkillFile[]>;

/** The file's place inside the skill's folder, or null when its path would leave it. */
function targetPath(skillDir: string, filePath: string): string | null {
  const target = path.resolve(skillDir, filePath);
  return target.startsWith(`${path.resolve(skillDir)}${path.sep}`) ? target : null;
}

/** Lists the skill folders the worker wrote, so only those are replaced next time. */
const MANIFEST_FILE = ".viberglass-skills.json";

function installedBefore(root: string): string[] {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_FILE), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string" && !name.includes("/") && name !== "..") : [];
  } catch {
    return [];
  }
}

/**
 * Writes the runner's skills where the agent's harness reads user-level
 * skills, one folder per skill. Skills an earlier run installed (restored
 * with its session state) are removed first, so one taken off the runner
 * doesn't linger; folders the worker didn't write are left alone.
 */
export class SkillInstaller {
  constructor(
    private readonly fetchSkill: SkillFetcher,
    private readonly logger: Logger,
  ) {}

  async install(skills: WorkerSkill[], homeDir: string, skillDirs: string[]): Promise<void> {
    const roots = skillDirs.map((dir) => path.join(homeDir, dir));
    for (const root of roots) {
      for (const name of installedBefore(root)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
      fs.rmSync(path.join(root, MANIFEST_FILE), { force: true });
    }
    if (skills.length === 0) return;

    for (const skill of skills) {
      const files = await this.fetchSkill(skill.id);
      for (const root of roots) {
        fs.rmSync(path.join(root, skill.name), { recursive: true, force: true });
        this.writeSkill(path.join(root, skill.name), files);
      }
      this.logger.info("Installed skill", { skill: skill.name, files: files.length, roots });
    }
    const names = JSON.stringify(skills.map((skill) => skill.name));
    for (const root of roots) {
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, MANIFEST_FILE), names);
    }
  }

  private writeSkill(skillDir: string, files: SkillFile[]): void {
    for (const file of files) {
      const target = targetPath(skillDir, file.path);
      if (!target) {
        this.logger.warn("Skipping a skill file outside its folder", { skillDir, path: file.path });
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(file.contentBase64, "base64"));
    }
  }
}
