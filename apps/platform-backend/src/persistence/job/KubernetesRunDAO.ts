import { sql } from "kysely";
import db from "../config/database";

/** Kubernetes runs as the jobs table has them, for counting runs against the worker limit. */
export class KubernetesRunDAO {
  async running(): Promise<string[]> {
    const rows = await db.selectFrom("jobs").select("id").where("status", "=", "active").where("worker_type", "=", "kubernetes").execute();
    return rows.map((row) => row.id);
  }

  /** Runs left waiting for a free worker by a backend that stopped. */
  async abandonedWaiting(): Promise<string[]> {
    const rows = await db
      .selectFrom("jobs")
      .select("id")
      .where("status", "=", "queued")
      .where(sql<string>`progress->>'waitingForWorker'`, "=", "true")
      .execute();
    return rows.map((row) => row.id);
  }

  async stillOpen(jobIds: string[]): Promise<string[]> {
    if (jobIds.length === 0) return [];
    const rows = await db.selectFrom("jobs").select("id").where("id", "in", jobIds).where("status", "in", ["queued", "active"]).execute();
    return rows.map((row) => row.id);
  }
}
