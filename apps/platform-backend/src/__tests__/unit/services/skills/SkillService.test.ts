import { strToU8 } from "fflate";
import { SkillService } from "../../../../services/skills/SkillService";
import type { SkillDAO, SkillRecord } from "../../../../persistence/skill/SkillDAO";

const SKILL_MD = strToU8("---\nname: pdf-forms\ndescription: Fill in PDF forms.\n---\n");

const record: SkillRecord = {
  id: "k1",
  name: "pdf-forms",
  description: "Fill in PDF forms.",
  storageUrl: "file:///skills/k1/v1.zip",
  fileCount: 1,
  sizeBytes: 10,
  createdAt: "",
  updatedAt: "",
};

function daoWith(overrides: Partial<Record<keyof SkillDAO, jest.Mock>>): SkillDAO {
  return Object.assign(Object.create(null), {
    list: jest.fn(),
    get: jest.fn(async () => record),
    getByIds: jest.fn(),
    findByName: jest.fn(async () => null),
    create: jest.fn(async (id: string) => ({ ...record, id })),
    update: jest.fn(async () => record),
    delete: jest.fn(),
    runnersUsing: jest.fn(async () => []),
    ...overrides,
  });
}

const storage = () => ({ save: jest.fn(async () => "file:///skills/new.zip"), read: jest.fn(), delete: jest.fn() });

describe("SkillService", () => {
  it("refuses a second skill with the same name", async () => {
    const service = new SkillService(daoWith({ findByName: jest.fn(async () => record) }), storage());
    await expect(service.create({ fileName: "SKILL.md", bytes: SKILL_MD })).rejects.toThrow('A skill named "pdf-forms" already exists');
  });

  it("stores a new version before deleting the old one", async () => {
    const files = storage();
    const dao = daoWith({});
    await new SkillService(dao, files).replace("k1", { fileName: "SKILL.md", bytes: SKILL_MD });
    expect(dao.update).toHaveBeenCalledWith("k1", expect.objectContaining({ storageUrl: "file:///skills/new.zip" }));
    expect(files.delete).toHaveBeenCalledWith(record.storageUrl);
  });

  it("won't remove a skill a runner still uses, and names the runner", async () => {
    const service = new SkillService(daoWith({ runnersUsing: jest.fn(async () => ["Main runner"]) }), storage());
    await expect(service.delete("k1")).rejects.toThrow("Main runner");
  });
});
