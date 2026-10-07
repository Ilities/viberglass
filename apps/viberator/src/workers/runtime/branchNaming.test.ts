import { buildFeatureBranchName } from "@viberglass/types";

describe("buildFeatureBranchName", () => {
  test("supports ticket, original_ticket, and clanker placeholders", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      "ticket-42",
      "SC-77",
      "clanker-9",
      "viberglass/{{ ticket }}/{{ original_ticket }}/{{ clanker }}",
    );

    expect(branch).toBe("viberglass/ticket-42/SC-77/clanker-9");
  });

  test("falls back to default template when template is empty", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      undefined,
      undefined,
      undefined,
      null,
    );

    // Default template is viberglass/{{ ticketId }}, which falls back to jobId
    expect(branch).toBe("viberglass/job_123");
  });
});
