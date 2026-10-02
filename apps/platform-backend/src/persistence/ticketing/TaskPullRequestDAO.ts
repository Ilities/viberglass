import db from "../config/database";

/** Tasks found by their pull request. */
export class TaskPullRequestDAO {
  /** The tasks still open whose pull request this is. */
  async listOpenTaskIds(pullRequestUrl: string): Promise<string[]> {
    const rows = await db
      .selectFrom("tickets")
      .select("id")
      .where("pull_request_url", "=", pullRequestUrl)
      .where("ticket_status", "!=", "resolved")
      .execute();
    return rows.map((row) => row.id);
  }
}
