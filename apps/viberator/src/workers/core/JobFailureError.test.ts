import { JOB_FAILURE_CODE } from "@viberglass/types";
import { failingWith, JobFailureError } from "./JobFailureError";

describe("failingWith", () => {
  it("returns the step's result when it succeeds", async () => {
    await expect(failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, async () => 42)).resolves.toBe(42);
  });

  it("reports a failing step with the given code and its message", async () => {
    const error = await failingWith(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED, async () => {
      throw new Error("Git clone failed: repository not found");
    }).catch((e) => e);

    expect(error).toBeInstanceOf(JobFailureError);
    expect(error.code).toBe(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED);
    expect(error.message).toBe("Git clone failed: repository not found");
  });

  it("lets the step's error pick the code", async () => {
    const error = await failingWith(() => JOB_FAILURE_CODE.REPOSITORY_NETWORK_FAILED, async () => {
      throw new Error("Could not resolve host: github.com");
    }).catch((e) => e);

    expect(error.code).toBe(JOB_FAILURE_CODE.REPOSITORY_NETWORK_FAILED);
  });

  it("keeps a more specific code thrown inside the step", async () => {
    const error = await failingWith(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED, async () => {
      throw new JobFailureError(JOB_FAILURE_CODE.AGENT_NO_CHANGES, "nothing changed");
    }).catch((e) => e);

    expect(error.code).toBe(JOB_FAILURE_CODE.AGENT_NO_CHANGES);
  });
});
