import { parseCorpus } from "./corpus";

const line = (manifest: Record<string, unknown>, pullRequestOutcome: unknown = null) =>
  JSON.stringify({ manifest: { job_id: "job-1", job_kind: "execution", dispatched_at: "2026-09-30T10:00:00.000Z", ...manifest }, pullRequestOutcome });

describe("parseCorpus", () => {
  it("reads the fields graders use from an export line", () => {
    const [record] = parseCorpus(
      line(
        {
          ticket_id: "ticket-1",
          agent: "opencode",
          success: true,
          pull_request_url: "https://github.com/acme/app/pull/1",
          cost_usd: "0.012300",
          cost_provenance: "actual",
          usage_available: true,
        },
        { state: "merged", comment_count: 2, review_comment_count: 3 },
      ),
    );

    expect(record).toEqual({
      jobId: "job-1",
      jobKind: "execution",
      ticketId: "ticket-1",
      agent: "opencode",
      dispatchedAt: "2026-09-30T10:00:00.000Z",
      success: true,
      pullRequestUrl: "https://github.com/acme/app/pull/1",
      costUsd: 0.0123,
      costProvenance: "actual",
      usageAvailable: true,
      pullRequest: { state: "merged", commentCount: 2, reviewCommentCount: 3 },
    });
  });

  it("keeps unrecorded fields null rather than defaulting them", () => {
    const [record] = parseCorpus(line({ success: null, cost_usd: null, requested_agent: "claude-code" }));

    expect(record).toMatchObject({
      ticketId: null,
      agent: "claude-code",
      success: null,
      costUsd: null,
      costProvenance: null,
      usageAvailable: null,
      pullRequest: null,
    });
  });

  it("skips blank lines", () => {
    expect(parseCorpus(`${line({})}\n\n${line({ job_id: "job-2" })}\n`)).toHaveLength(2);
  });

  it("names the line a malformed record is on", () => {
    expect(() => parseCorpus(`${line({})}\n{"manifest":{"job_id":"x"}}`)).toThrow("Line 2");
  });
});
