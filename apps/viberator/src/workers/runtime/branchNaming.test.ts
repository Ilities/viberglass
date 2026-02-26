import { buildFeatureBranchName } from "./branchNaming";

describe("buildFeatureBranchName", () => {
  test("supports ticket, original_ticket, and clanker placeholders", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      "ticket-42",
      "SC-77",
      "clanker-9",
      "viberator/{{ ticket }}/{{ original_ticket }}/{{ clanker }}",
    );

    expect(branch).toBe("viberator/ticket-42/SC-77/clanker-9");
  });

  test("falls back to default template when template is empty", () => {
    const branch = buildFeatureBranchName(
      "job_123",
      undefined,
      undefined,
      undefined,
      null,
    );

    const expectedDate = new Date().toISOString().slice(0, 10);
    expect(branch).toBe(`viberator/${expectedDate}`);
  });
});
