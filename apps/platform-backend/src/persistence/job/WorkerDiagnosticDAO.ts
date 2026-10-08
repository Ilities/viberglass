import { createHash } from "crypto";
import db from "../config/database";
import type { JobLogEntry } from "../../services/job/JobProgressService";

export class WorkerDiagnosticDAO {
  async record(jobId: string, source: string, diagnostics: JobLogEntry[]): Promise<void> {
    if (!diagnostics.length) return;
    const values = diagnostics.map(diagnostic => {
      const hash = createHash("sha256").update(`${jobId}\0${source}\0${diagnostic.level}\0${diagnostic.message}`).digest("hex");
      return {
        id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`,
        job_id: jobId, level: diagnostic.level, message: diagnostic.message.slice(0, 16_000),
        source, created_at: new Date(),
      };
    });
    // Cluster observations must not count as a heartbeat from the worker.
    await db.insertInto("job_log_lines").values(values).onConflict(conflict => conflict.column("id").doNothing()).execute();
  }
}
