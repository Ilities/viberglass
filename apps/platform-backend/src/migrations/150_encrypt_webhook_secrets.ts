import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Kysely } from "kysely";

// The same format the backend reads: base64(iv):base64(ciphertext):base64(authTag), AES-256-GCM.
function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64")).join(":");
}

function decrypt(value: string, key: Buffer): string | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  try {
    const [iv, ciphertext, authTag] = parts.map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

async function rewriteSecrets(db: Kysely<any>, rewrite: (value: string, key: Buffer) => string | null): Promise<void> {
  const rows: Array<{ id: string; webhook_secret_encrypted: string }> = await db
    .selectFrom("webhook_provider_configs")
    .select(["id", "webhook_secret_encrypted"])
    .where("webhook_secret_encrypted", "is not", null)
    .execute();
  if (rows.length === 0) return;

  const secret = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("WEBHOOK_SECRET_ENCRYPTION_KEY must be set to encrypt the stored webhook secrets");
  }
  const key = keyFrom(secret);
  for (const row of rows) {
    const next = rewrite(row.webhook_secret_encrypted, key);
    if (next === null) continue;
    await db.updateTable("webhook_provider_configs").set({ webhook_secret_encrypted: next }).where("id", "=", row.id).execute();
  }
}

/** Webhook secrets were kept as they were given; a value that already decrypts is left alone. */
export async function up(db: Kysely<any>): Promise<void> {
  await rewriteSecrets(db, (value, key) => (decrypt(value, key) === null ? encrypt(value, key) : null));
}

export async function down(db: Kysely<any>): Promise<void> {
  await rewriteSecrets(db, (value, key) => decrypt(value, key));
}
