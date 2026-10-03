import { strToU8, zipSync } from "fflate";
import { readSkillPackage, unpackSkillArchive } from "../../../../services/skills/SkillPackageReader";
import { readFrontmatter } from "../../../../services/skills/skillFrontmatter";

const SKILL_MD = "---\nname: pdf-forms\ndescription: Fill in PDF forms. Use when a task involves a PDF form.\n---\n# PDF forms\n";

describe("readSkillPackage", () => {
  it("reads a single SKILL.md", () => {
    const skill = readSkillPackage("SKILL.md", strToU8(SKILL_MD));
    expect(skill).toMatchObject({ name: "pdf-forms", fileCount: 1 });
    expect(Array.from(unpackSkillArchive(skill.archive).keys())).toEqual(["SKILL.md"]);
  });

  it("drops the skill folder zip tools put around the files, and their clutter", () => {
    const zip = zipSync({
      "pdf-forms/SKILL.md": strToU8(SKILL_MD),
      "pdf-forms/scripts/fill.py": strToU8("print('hi')"),
      "__MACOSX/pdf-forms/._SKILL.md": strToU8("x"),
      "pdf-forms/.DS_Store": strToU8("x"),
    });
    const skill = readSkillPackage("pdf-forms.zip", zip);
    expect(Array.from(unpackSkillArchive(skill.archive).keys()).sort()).toEqual(["SKILL.md", "scripts/fill.py"]);
  });

  it("refuses an archive without a SKILL.md at the top", () => {
    const zip = zipSync({ "a/b/SKILL.md": strToU8(SKILL_MD), "other/readme.md": strToU8("x") });
    expect(() => readSkillPackage("skill.zip", zip)).toThrow("needs a SKILL.md");
  });

  it("refuses a name that harnesses won't accept", () => {
    expect(() => readSkillPackage("SKILL.md", strToU8("---\nname: PDF Forms\ndescription: x\n---\n"))).toThrow("lowercase");
  });

  it("refuses a SKILL.md without a description", () => {
    expect(() => readSkillPackage("SKILL.md", strToU8("---\nname: pdf-forms\n---\n"))).toThrow("description");
  });

  it("refuses something that isn't a zip", () => {
    expect(() => readSkillPackage("skill.zip", strToU8("not a zip"))).toThrow("readable zip");
  });
});

describe("readFrontmatter", () => {
  it("reads quoted and folded values", () => {
    expect(readFrontmatter("---\nname: 'a-b'\ndescription: >\n  Does a thing.\n  Use it often.\nmetadata:\n  x: y\n---\nbody")).toEqual({
      name: "a-b",
      description: "Does a thing. Use it often.",
      metadata: "",
    });
  });

  it("is null without frontmatter", () => {
    expect(readFrontmatter("# Just a heading")).toBeNull();
  });
});
