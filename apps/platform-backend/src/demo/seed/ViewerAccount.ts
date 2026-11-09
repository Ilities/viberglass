import type { PoolClient } from "pg";
import type { BundleViewer } from "../bundle/bundleManifest";

export interface ViewerCredentials {
  email: string;
  password: string;
  name: string;
}

/**
 * The one account demo visitors share: a viewer, either the exported person
 * who stood in for it during capture or a new one, watching the bundle's tasks.
 */
export class ViewerAccount {
  constructor(
    private readonly db: Pick<PoolClient, "query">,
    private readonly hashPassword: (password: string) => Promise<string>,
    private readonly log: (line: string) => void,
  ) {}

  async apply(viewer: BundleViewer, credentials: ViewerCredentials): Promise<string> {
    const email = credentials.email.trim().toLowerCase();
    const passwordHash = await this.hashPassword(credentials.password);
    const userId = (viewer.userId && (await this.takeOver(viewer.userId, email, passwordHash))) || (await this.create(email, credentials.name, passwordHash));
    await this.watch(userId, viewer.watchTaskKeys);
    return userId;
  }

  private async takeOver(userId: string, email: string, passwordHash: string): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `UPDATE users SET email = $1, password_hash = $2, role = 'viewer', deactivated_at = NULL WHERE id = $3 RETURNING id`,
      [email, passwordHash, userId],
    );
    return result.rows[0]?.id ?? null;
  }

  private async create(email: string, name: string, passwordHash: string): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'viewer') RETURNING id`,
      [email, name, passwordHash],
    );
    return result.rows[0].id;
  }

  private async watch(userId: string, taskKeys: readonly string[]): Promise<void> {
    if (taskKeys.length === 0) return;
    const result = await this.db.query<{ task_key: string }>(
      `INSERT INTO task_participants (ticket_id, user_id, role)
       SELECT id, $1, 'watcher' FROM tickets WHERE task_key = ANY($2::text[])
       ON CONFLICT DO NOTHING
       RETURNING (SELECT task_key FROM tickets WHERE tickets.id = task_participants.ticket_id)`,
      [userId, [...taskKeys]],
    );
    const watched = new Set(result.rows.map((row) => row.task_key));
    const missing = taskKeys.filter((key) => !watched.has(key));
    if (missing.length > 0) this.log(`The viewer already watches, or there is no task, ${missing.join(", ")}`);
  }
}
