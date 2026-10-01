import { isAuditAction, isAuditTargetType, isObjectRecord, type AuditAction, type AuditEntry, type AuditTargetType } from "@viberglass/types";
import db from "../config/database";

export interface AuditRecord {
  actorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
}

export interface AuditQuery {
  actorId?: string;
  targetType?: AuditTargetType;
  /** Entries older than this, for the next page. */
  before?: Date;
  limit: number;
}

export class AuditLogDAO {
  async record(entry: AuditRecord): Promise<void> {
    await db
      .insertInto("audit_log")
      .values({
        actor_id: entry.actorId,
        actor_kind: entry.actorId ? "human" : "system",
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        details_json: JSON.stringify(entry.details),
        ip: entry.ip,
      })
      .execute();
  }

  /** Newest first. */
  async list(query: AuditQuery): Promise<AuditEntry[]> {
    let select = db
      .selectFrom("audit_log as l")
      .leftJoin("users as u", "u.id", "l.actor_id")
      .select(["l.id", "l.actor_kind", "l.action", "l.target_type", "l.target_id", "l.details_json", "l.ip", "l.created_at", "u.id as actor_id", "u.name as actor_name"]);
    if (query.actorId) select = select.where("l.actor_id", "=", query.actorId);
    if (query.targetType) select = select.where("l.target_type", "=", query.targetType);
    if (query.before) select = select.where("l.created_at", "<", query.before);
    const rows = await select.orderBy("l.created_at", "desc").limit(query.limit).execute();
    return rows.flatMap((row) => {
      if (!isAuditAction(row.action) || !isAuditTargetType(row.target_type)) return [];
      return [
        {
          id: row.id,
          actor: row.actor_id && row.actor_name ? { id: row.actor_id, name: row.actor_name } : null,
          actorKind: row.actor_kind,
          action: row.action,
          targetType: row.target_type,
          targetId: row.target_id,
          details: isObjectRecord(row.details_json) ? row.details_json : {},
          ip: row.ip,
          createdAt: row.created_at.toISOString(),
        },
      ];
    });
  }
}
