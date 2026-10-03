import { randomUUID } from "crypto";
import type { Skill, SkillFile } from "@viberglass/types";
import { SkillDAO, type SkillRecord } from "../../persistence/skill/SkillDAO";
import { AGENT_TOOL_ERROR_CODE, AgentToolServiceError } from "../errors/AgentToolServiceError";
import { readSkillPackage, unpackSkillArchive } from "./SkillPackageReader";
import { SkillStorage } from "./SkillStorage";

export interface SkillUpload {
  fileName: string;
  bytes: Uint8Array;
}

function toSkill(record: SkillRecord): Skill {
  const { id, name, description, fileCount, sizeBytes, createdAt, updatedAt } = record;
  return { id, name, description, fileCount, sizeBytes, createdAt, updatedAt };
}

/** The workspace's skills: uploaded once by an admin, picked by runners. */
export class SkillService {
  constructor(
    private readonly skills: SkillDAO = new SkillDAO(),
    private readonly storage: Pick<SkillStorage, "save" | "read" | "delete"> = new SkillStorage(),
  ) {}

  async list(): Promise<Skill[]> {
    return (await this.skills.list()).map(toSkill);
  }

  async create(upload: SkillUpload): Promise<Skill> {
    const skillPackage = readSkillPackage(upload.fileName, upload.bytes);
    await this.assertNameFree(skillPackage.name);
    const id = randomUUID();
    const storageUrl = await this.storage.save(id, randomUUID(), skillPackage.archive);
    const created = await this.skills.create(id, { ...skillPackage, storageUrl });
    return toSkill(created);
  }

  /** A new version of the skill; its name may change with its SKILL.md. */
  async replace(id: string, upload: SkillUpload): Promise<Skill> {
    const existing = await this.require(id);
    const skillPackage = readSkillPackage(upload.fileName, upload.bytes);
    await this.assertNameFree(skillPackage.name, id);
    const storageUrl = await this.storage.save(id, randomUUID(), skillPackage.archive);
    const updated = await this.skills.update(id, { ...skillPackage, storageUrl });
    await this.storage.delete(existing.storageUrl);
    return toSkill(updated ?? existing);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.require(id);
    const runners = await this.skills.runnersUsing(id);
    if (runners.length > 0) {
      throw new AgentToolServiceError(
        AGENT_TOOL_ERROR_CODE.IN_USE,
        `Remove the skill from these agents first: ${runners.join(", ")}.`,
      );
    }
    await this.skills.delete(id);
    await this.storage.delete(existing.storageUrl);
  }

  /** The skill's files, for a worker to write where its harness reads skills. */
  async files(id: string): Promise<{ name: string; files: SkillFile[] }> {
    const skill = await this.require(id);
    const archive = await this.storage.read(skill.storageUrl);
    const files = Array.from(unpackSkillArchive(archive), ([path, content]) => ({
      path,
      contentBase64: Buffer.from(content).toString("base64"),
    }));
    return { name: skill.name, files };
  }

  private async require(id: string): Promise<SkillRecord> {
    const skill = await this.skills.get(id);
    if (!skill) throw new AgentToolServiceError(AGENT_TOOL_ERROR_CODE.NOT_FOUND, "Skill not found");
    return skill;
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await this.skills.findByName(name);
    if (existing && existing.id !== exceptId) {
      throw new AgentToolServiceError(
        AGENT_TOOL_ERROR_CODE.NAME_TAKEN,
        `A skill named "${name}" already exists. Upload it as a new version of that skill instead.`,
      );
    }
  }
}
