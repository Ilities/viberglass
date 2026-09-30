import { isObjectRecord } from "@viberglass/types";
import type { RunRecord, RunRecordPage } from "@viberglass/types";
import type { ManifestCursor } from "../../persistence/job/RunManifestExportDAO";
import type { RunRecordDAO } from "../../persistence/job/RunRecordDAO";
import { toRunRecord } from "./runRecordMapper";

export class InvalidRunRecordCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidRunRecordCursorError";
  }
}

/** Run records newest first, paged with an opaque cursor. */
export class RunRecordService {
  constructor(private readonly dao: Pick<RunRecordDAO, "listPage" | "getByJobId">) {}

  async list(cursor: string | undefined, limit: number): Promise<RunRecordPage> {
    // One extra row says whether there is another page without a count query.
    const rows = await this.dao.listPage(cursor ? decodeCursor(cursor) : null, limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];

    return {
      records: page.map(toRunRecord),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ dispatchedAt: new Date(last.dispatched_at), jobId: last.job_id })
          : null,
    };
  }

  async get(jobId: string): Promise<RunRecord | null> {
    const row = await this.dao.getByJobId(jobId);
    return row ? toRunRecord(row) : null;
  }
}

function encodeCursor(cursor: ManifestCursor): string {
  return Buffer.from(JSON.stringify({ d: cursor.dispatchedAt.toISOString(), j: cursor.jobId })).toString("base64url");
}

function decodeCursor(cursor: string): ManifestCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidRunRecordCursorError();
  }
  if (!isObjectRecord(parsed) || typeof parsed.d !== "string" || typeof parsed.j !== "string") {
    throw new InvalidRunRecordCursorError();
  }
  const dispatchedAt = new Date(parsed.d);
  if (Number.isNaN(dispatchedAt.getTime())) throw new InvalidRunRecordCursorError();
  return { dispatchedAt, jobId: parsed.j };
}
