import { CLAW_SCHEDULED_TASK_TEMPLATE as BEFORE } from "../../../migrations/057_xml_tag_templates";
import { CLAW_SCHEDULED_TASK_TEMPLATE } from "../../../migrations/126_files_scheduled_task_prompt";
import { PromptTemplateDAO } from "../../../persistence/promptTemplate/PromptTemplateDAO";
import { PromptTemplateService } from "../../../services/PromptTemplateService";

jest.mock("../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

/** The template as the migration leaves it. */
class SeededTemplate extends PromptTemplateDAO {
  override async getEffectiveTemplate(): Promise<string> {
    return CLAW_SCHEDULED_TASK_TEMPLATE;
  }
}

function render(vars: Record<string, string | undefined>): Promise<string> {
  return new PromptTemplateService(new SeededTemplate()).render("claw_scheduled_task", "space-1", vars);
}

// The migration edits stored templates with SQL replace(), which changes nothing
// when a string isn't found; the same edits made here show each one matched.
describe("the scheduled task template once schedules run in Files spaces", () => {
  it("changes the stored template", () => {
    expect(CLAW_SCHEDULED_TASK_TEMPLATE).not.toBe(BEFORE);
    expect(CLAW_SCHEDULED_TASK_TEMPLATE).toContain("{{^filesSpace}}Requirements:");
  });

  it("reads as before in a repository space", async () => {
    const prompt = await render({ taskInstructions: "Update the dependencies." });

    expect(prompt).toBe(BEFORE.replace("{{taskInstructions}}", "Update the dependencies."));
  });

  it("asks for the space's files and an optional artifact, not a pull request, in a Files space", async () => {
    const prompt = await render({ taskInstructions: "Write the weekly report.", filesSpace: "yes" });

    expect(prompt).toContain("Write the weekly report.");
    expect(prompt).toContain("this space's shared files, not a repository");
    expect(prompt).toContain(".viberglass/artifacts.json");
    expect(prompt).not.toMatch(/PR_TITLE|pull request|software engineer/);
  });
});
