import type { LogLineRow, ManifestRow, PullRequestOutcomeRow } from "../../../persistence/job/RunManifestExportDAO";
import { RunManifestExportService } from "../../../services/RunManifestExportService";

function manifest(jobId: string, minute: number, pullRequestUrl: string | null = null): ManifestRow {
  const at = new Date(Date.UTC(2026, 8, 30, 10, minute));
  return {
    job_id: jobId, manifest_version: 1, tenant_id: "tenant-1", job_kind: "execution",
    ticket_id: null, project_id: "project-1", clanker_id: null, requested_agent: null,
    repository: "https://github.com/acme/app", base_branch: "main", worker_type: null,
    compute_image: null, config_hash: null, instructions_hash: null,
    granted_credential_names: null, dispatched_at: at, agent: "opencode",
    harness_version: null, model_snapshot: null, base_sha: null, commit_sha: null,
    branch: null, pull_request_url: pullRequestUrl, changed_file_count: null,
    prompt_hash: null, prompt_characters: null, tool_permissions: null, usage: null,
    usage_available: false, cost_usd: null, cost_provenance: "unavailable",
    stop_reason: null, success: true, error_message: null, started_at: null,
    finished_at: null, duration_ms: null, grader_version: null,
    created_at: at, updated_at: at,
  };
}

function outcome(pullRequestUrl: string): PullRequestOutcomeRow {
  const at = new Date(Date.UTC(2026, 8, 30, 12));
  return {
    pull_request_url: pullRequestUrl, state: "merged", merged_at: at, closed_at: at,
    comment_count: 0, review_comment_count: 0, checked_at: at, last_error: null,
    created_at: at, updated_at: at,
  };
}

async function collect<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

describe("RunManifestExportService", () => {
  const dao = { listPage: jest.fn(), listOutcomes: jest.fn(), listLogLines: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    dao.listOutcomes.mockResolvedValue([]);
  });

  it("pages through manifests with a cursor after the last row", async () => {
    const first = [manifest("a", 1), manifest("b", 2)];
    dao.listPage.mockResolvedValueOnce(first).mockResolvedValueOnce([manifest("c", 3)]);
    const filter = { since: new Date("2026-09-01") };

    const records = await collect(new RunManifestExportService(dao, 2).records(filter));

    expect(records.map((record) => record.manifest.job_id)).toEqual(["a", "b", "c"]);
    expect(dao.listPage).toHaveBeenNthCalledWith(1, filter, null, 2);
    expect(dao.listPage).toHaveBeenNthCalledWith(2, filter, { dispatchedAt: first[1].dispatched_at, jobId: "b" }, 2);
    expect(dao.listPage).toHaveBeenCalledTimes(2);
  });

  it("stops on an empty page", async () => {
    dao.listPage.mockResolvedValueOnce([manifest("a", 1), manifest("b", 2)]).mockResolvedValueOnce([]);

    const records = await collect(new RunManifestExportService(dao, 2).records({}));

    expect(records).toHaveLength(2);
    expect(dao.listPage).toHaveBeenCalledTimes(2);
  });

  it("joins each manifest to its pull request outcome", async () => {
    const url = "https://github.com/acme/app/pull/1";
    dao.listPage.mockResolvedValueOnce([manifest("a", 1, url), manifest("b", 2, url), manifest("c", 3)]);
    dao.listOutcomes.mockResolvedValue([outcome(url)]);

    const records = await collect(new RunManifestExportService(dao).records({}));

    expect(dao.listOutcomes).toHaveBeenCalledWith([url]);
    expect(records.map((record) => record.pullRequestOutcome?.state ?? null)).toEqual(["merged", "merged", null]);
  });

  it("attaches log lines only when asked", async () => {
    const lines: LogLineRow[] = [{ created_at: new Date(), level: "info", source: "viberator", message: "hi" }];
    dao.listPage.mockResolvedValue([manifest("a", 1)]);
    dao.listLogLines.mockResolvedValue(lines);

    const [withoutLogs] = await collect(new RunManifestExportService(dao).records({}));
    const [withLogs] = await collect(new RunManifestExportService(dao).records({ includeLogs: true }));

    expect(withoutLogs).not.toHaveProperty("logs");
    expect(withLogs.logs).toEqual(lines);
    expect(dao.listLogLines).toHaveBeenCalledWith("a");
  });
});
