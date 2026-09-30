import { readOpenCodeSessionDetails } from "../src/readOpenCodeSessionDetails";

const runStdout = JSON.stringify({ type: "step_finish", sessionID: "ses_1", part: { type: "step-finish" } });
const exported = JSON.stringify({ info: { model: { id: "glm-5.3-flash", providerID: "opencode-go" }, version: "1.18.25" } });

describe("readOpenCodeSessionDetails", () => {
  it("exports the run's session and reads the model and version", async () => {
    const opencode = jest.fn().mockResolvedValue({ stdout: exported, stderr: "", exitCode: 0 });

    await expect(readOpenCodeSessionDetails(runStdout, opencode)).resolves.toEqual({
      model: "opencode-go/glm-5.3-flash",
      harnessVersion: "1.18.25",
    });
    expect(opencode).toHaveBeenCalledWith(["export", "ses_1"]);
  });

  it("does not export when the run named no session", async () => {
    const opencode = jest.fn();

    await expect(readOpenCodeSessionDetails("", opencode)).resolves.toEqual({});
    expect(opencode).not.toHaveBeenCalled();
  });

  it.each([
    ["exits non-zero", jest.fn().mockResolvedValue({ stdout: "", stderr: "Session not found", exitCode: 1 }), "exited 1: Session not found"],
    ["throws", jest.fn().mockRejectedValue(new Error("Command timeout after 60000ms")), "Command timeout"],
    ["prints something else", jest.fn().mockResolvedValue({ stdout: "Update available", stderr: "", exitCode: 0 }), "no model or version"],
  ])("reports nothing, and why, when the export %s", async (_label, opencode, reason) => {
    const onFailure = jest.fn();

    await expect(readOpenCodeSessionDetails(runStdout, opencode, onFailure)).resolves.toEqual({});
    expect(onFailure).toHaveBeenCalledWith(expect.stringContaining(reason));
  });
});
