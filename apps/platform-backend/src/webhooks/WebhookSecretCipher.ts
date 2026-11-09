import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;

/**
 * Encrypts webhook secrets kept in the database with AES-256-GCM, as
 * base64(iv):base64(ciphertext):base64(authTag).
 */
export class WebhookSecretCipher {
  constructor(private readonly key?: string) {}

  encrypt(secret: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.derivedKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64")).join(":");
  }

  decrypt(encrypted: string): string {
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted secret format. Expected: iv:ciphertext:authTag");
    }
    const [iv, ciphertext, authTag] = parts.map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", this.derivedKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  /** Read on use, so code that builds a cipher at import time loads without the key. */
  private derivedKey(): Buffer {
    const key = this.key ?? process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    if (!key) {
      throw new Error("WEBHOOK_SECRET_ENCRYPTION_KEY environment variable must be set");
    }
    return createHash("sha256").update(key).digest();
  }
}
