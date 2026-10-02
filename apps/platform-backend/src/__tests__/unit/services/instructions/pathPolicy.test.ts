import { isAllowedInstructionPath } from "../../../../services/instructions/pathPolicy";

describe("isAllowedInstructionPath", () => {
  test.each(["AGENTS.md", "skills/review.md", "opencode.json", "pi/models.json"])("allows %s", (path) => {
    expect(isAllowedInstructionPath(path)).toBe(true);
  });

  test.each(["pi/settings.json", "../AGENTS.md", "skills/review.txt", "/etc/passwd"])("rejects %s", (path) => {
    expect(isAllowedInstructionPath(path)).toBe(false);
  });
});
