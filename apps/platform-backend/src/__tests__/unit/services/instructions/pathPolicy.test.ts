import { isAllowedInstructionPath } from "../../../../services/instructions/pathPolicy";

describe("isAllowedInstructionPath", () => {
  test.each(["AGENTS.md", "opencode.json", "pi/models.json"])("allows %s", (path) => {
    expect(isAllowedInstructionPath(path)).toBe(true);
  });

  test.each(["pi/settings.json", "../AGENTS.md", "skills/review.md", "/etc/passwd"])("rejects %s", (path) => {
    expect(isAllowedInstructionPath(path)).toBe(false);
  });
});
