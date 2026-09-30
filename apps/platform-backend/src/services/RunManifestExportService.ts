import type {
  LogLineRow,
  ManifestCursor,
  ManifestExportFilter,
  ManifestRow,
  PullRequestOutcomeRow,
  RunManifestExportDAO,
} from "../persistence/job/RunManifestExportDAO";

export interface RunManifestExportRecord {
  manifest: ManifestRow;
  pullRequestOutcome: PullRequestOutcomeRow | null;
  logs?: LogLineRow[];
}

export interface RunManifestExportOptions extends ManifestExportFilter {
  includeLogs?: boolean;
}

/**
 * One record per job — the manifest, the outcome of its PR, and optionally its
 * log lines, which carry the agent's trajectory.
 *
 * Rows keep their column names so the export follows the tables without a
 * mapping to maintain. Paged, so an export of any size runs in bounded memory.
 */
export class RunManifestExportService {
  constructor(
    private readonly dao: Pick<RunManifestExportDAO, "listPage" | "listOutcomes" | "listLogLines">,
    private readonly pageSize = 200,
  ) {}

  async *records(options: RunManifestExportOptions): AsyncGenerator<RunManifestExportRecord> {
    let after: ManifestCursor | null = null;
    for (;;) {
      const page = await this.dao.listPage(options, after, this.pageSize);
      if (page.length === 0) return;

      const outcomes = await this.outcomesByUrl(page);
      for (const manifest of page) {
        const record: RunManifestExportRecord = {
          manifest,
          pullRequestOutcome: manifest.pull_request_url
            ? (outcomes.get(manifest.pull_request_url) ?? null)
            : null,
        };
        if (options.includeLogs) {
          record.logs = await this.dao.listLogLines(manifest.job_id);
        }
        yield record;
      }

      if (page.length < this.pageSize) return;
      const last = page[page.length - 1];
      after = { dispatchedAt: last.dispatched_at, jobId: last.job_id };
    }
  }

  private async outcomesByUrl(page: ManifestRow[]): Promise<Map<string, PullRequestOutcomeRow>> {
    const urls = [
      ...new Set(page.flatMap((manifest) => (manifest.pull_request_url ? [manifest.pull_request_url] : []))),
    ];
    const outcomes = await this.dao.listOutcomes(urls);
    return new Map(outcomes.map((outcome) => [outcome.pull_request_url, outcome]));
  }
}
