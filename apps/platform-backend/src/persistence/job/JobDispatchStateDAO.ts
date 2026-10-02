import db from "../config/database";
import type { JobStatus } from "../../types/Job";

export class JobDispatchStateDAO {
  async getStatus(jobId: string): Promise<JobStatus | undefined> {
    const job = await db.selectFrom("jobs").select("status").where("id", "=", jobId).executeTakeFirst();
    return job?.status;
  }
}
