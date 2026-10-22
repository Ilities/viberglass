import { AGENT_CATALOG, JOB_FAILURE_CODE } from "@viberglass/types";
import { describeJobFailure } from "../../../services/job/describeJobFailure";
import { readJobFailure } from "../../../services/job/readJobFailure";

describe("describeJobFailure", () => {
  it("describes every known code with a title, summary and category", () => {
    for (const code of Object.values(JOB_FAILURE_CODE)) {
      const failure = describeJobFailure(code);
      expect(failure.code).toBe(code);
      expect(failure.title).toBeTruthy();
      expect(failure.summary).toBeTruthy();
      expect(["setup", "agent", "platform"]).toContain(failure.category);
    }
  });

  it("sends setup problems to admins and agent problems to a retry", () => {
    expect(describeJobFailure(JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED).category).toBe("setup");
    expect(describeJobFailure(JOB_FAILURE_CODE.AGENT_NO_DOCUMENT)).toMatchObject({
      category: "agent",
      retryable: true,
    });
  });

  it("does not read the error text: a missing or unknown code is unrecognised", () => {
    // This text used to be classified as a credential problem by a regex.
    const failure = describeJobFailure(undefined, "401 unauthorized: token expired");
    expect(failure).toMatchObject({
      code: JOB_FAILURE_CODE.RUN_FAILED,
      category: "platform",
      technicalDetail: "401 unauthorized: token expired",
    });
    expect(describeJobFailure("SOMETHING_NEW").code).toBe(JOB_FAILURE_CODE.RUN_FAILED);
  });
});

describe("readJobFailure", () => {
  it("reads a stored failure", () => {
    const stored = describeJobFailure(JOB_FAILURE_CODE.RUN_LOST, "no heartbeat");
    expect(readJobFailure(JSON.parse(JSON.stringify(stored)))).toEqual(stored);
  });

  it("reads failures recorded before titles and categories existed", () => {
    expect(
      readJobFailure({ code: "SCM_CREDENTIAL_INVALID", summary: "Old summary", retryable: false }),
    ).toEqual({ code: "SCM_CREDENTIAL_INVALID", summary: "Old summary", retryable: false });
  });

  it("ignores anything that isn't a failure", () => {
    expect(readJobFailure(null)).toBeNull();
    expect(readJobFailure("failed")).toBeNull();
    expect(readJobFailure({ code: 1, summary: "x" })).toBeNull();
    expect(readJobFailure({ code: "X", summary: "x", category: "other" })).toEqual({
      code: "X",
      summary: "x",
      retryable: false,
    });
  });

  it("adds what the run's harness says about a rejected key", () => {
    const harness = AGENT_CATALOG.find((entry) => entry.rejectedKeyNote);
    if (!harness?.rejectedKeyNote) throw new Error("No harness has a rejected-key note");
    const failure = describeJobFailure(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID, "401", harness.agent);
    expect(failure.summary).toBe(`The model provider rejected the agent's API key or login. ${harness.rejectedKeyNote}`);
  });

  it("adds nothing for other failures, or for harnesses without a note", () => {
    const harness = AGENT_CATALOG.find((entry) => entry.rejectedKeyNote);
    const plain = AGENT_CATALOG.find((entry) => !entry.rejectedKeyNote);
    expect(describeJobFailure(JOB_FAILURE_CODE.AGENT_FAILED, undefined, harness?.agent).summary).toBe("The agent stopped with an error before finishing.");
    expect(describeJobFailure(JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID, undefined, plain?.agent).summary).toBe(
      "The model provider rejected the agent's API key or login.",
    );
  });
});
