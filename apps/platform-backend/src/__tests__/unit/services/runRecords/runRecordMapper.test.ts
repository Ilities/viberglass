import { toRunRecord } from "../../../../services/runRecords/runRecordMapper";
import { runRecordRow } from "./runRecordFixtures";

describe("toRunRecord", () => {
  it("maps a manifest with its PR outcome", () => {
    const record = toRunRecord(runRecordRow());

    expect(record).toMatchObject({
      jobId: "job-1",
      projectSlug: "acme",
      ticketTitle: "Fix it",
      clankerName: "OpenCode Local",
      clankerSlug: "opencode-local",
      costUsd: 0.001169,
      costProvenance: "actual",
      dispatchedAt: "2026-09-30T10:00:00.000Z",
      usage: {
        inputTokens: 7748,
        outputTokens: 14,
        reasoningOutputTokens: 0,
        cacheReadInputTokens: null,
        cacheCreationInputTokens: null,
      },
      pullRequest: {
        url: "https://github.com/acme/app/pull/1",
        state: "merged",
        commentCount: 1,
        reviewCommentCount: 2,
        checkedAt: "2026-09-30T10:00:00.000Z",
      },
    });
  });

  it("reports a PR the sweeper has not checked yet with no state", () => {
    const record = toRunRecord(runRecordRow({ pr_state: null, pr_checked_at: null, pr_comment_count: null }));

    expect(record.pullRequest).toMatchObject({ state: null, checkedAt: null, commentCount: null });
  });

  it("has no PR outcome, usage or cost when none were recorded", () => {
    const record = toRunRecord(runRecordRow({ pull_request_url: null, usage: null, cost_usd: null, started_at: null }));

    expect(record.pullRequest).toBeNull();
    expect(record.usage).toBeNull();
    expect(record.costUsd).toBeNull();
    expect(record.startedAt).toBeNull();
  });
});
