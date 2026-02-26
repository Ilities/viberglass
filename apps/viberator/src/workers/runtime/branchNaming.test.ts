import { buildFeatureBranchName } from "./branchNaming";

describe("buildFeatureBranchName", () => {
  test("supports ticket, original_ticket, and clanker placeholders", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      "ticket-42",
      "SC-77",
      "clanker-9",
      "fix/{{ ticket }}/{{ original_ticket }}/{{ clanker }}",
    );

    expect(branch).toBe("fix/ticket-42/SC-77/clanker-9");
  });

  test("falls back when template is empty", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      undefined,
      undefined,
      undefined,
      null,
    );

    expect(branch).toBe("fix/job_123");
  });
});
