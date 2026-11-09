import { Kysely, sql } from "kysely";

async function allowStatuses(db: Kysely<any>, statuses: string[]): Promise<void> {
  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT webhook_delivery_attempts_status_check`.execute(db);
  await sql`
    ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_status_check
    CHECK (status IN (${sql.join(statuses.map((status) => sql.lit(status)))}))
  `.execute(db);
}

/**
 * Requests refused for their signature were kept as failed deliveries with
 * their payload and delivery id. They become payload-free rejected rows whose
 * delivery id no longer holds back the real delivery.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await allowStatuses(db, ["pending", "processing", "succeeded", "failed", "ignored", "rejected"]);
  await sql`
    UPDATE webhook_delivery_attempts
    SET status = 'rejected',
        payload = '{}'::jsonb,
        event_type = 'unverified',
        delivery_id = 'rejected-' || id,
        error_message = substring(error_message FROM 11)
    WHERE status = 'failed' AND error_message LIKE 'Rejected: %'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE webhook_delivery_attempts
    SET status = 'failed', error_message = 'Rejected: ' || COALESCE(error_message, 'Invalid signature')
    WHERE status = 'rejected'
  `.execute(db);
  await allowStatuses(db, ["pending", "processing", "succeeded", "failed", "ignored"]);
}
