import { notificationText } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import { CredentialExpiryDAO } from "../../persistence/integrations/CredentialExpiryDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { EXPIRY_WARNING_MS } from "../ProjectReadinessService";
import { EmailChannel } from "./EmailChannel";
import type { NotificationChannel } from "./NotificationChannel";
import { ChatDmChannel } from "./ChatDmChannel";

const logger = createChildLogger({ service: "CredentialExpiryWarner" });

interface Dependencies {
  credentials: Pick<CredentialExpiryDAO, "listUnwarnedExpiringBefore" | "markWarned">;
  users: Pick<UserDAO, "listActiveAdminIds">;
  channels: NotificationChannel[];
  frontendUrl: string | undefined;
}

/**
 * Tells workspace admins, once, that a connection's credential expires within
 * the week, by chat and email, with a link to replace it. A run that needs
 * it would otherwise stop the day it expires.
 */
export class CredentialExpiryWarner {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      credentials: new CredentialExpiryDAO(),
      users: new UserDAO(),
      channels: [new ChatDmChannel(), new EmailChannel()],
      frontendUrl: process.env.PLATFORM_FRONTEND_URL,
      ...deps,
    };
  }

  /** Returns how many credentials it warned about. */
  async warn(now: Date): Promise<number> {
    const expiring = await this.deps.credentials.listUnwarnedExpiringBefore(new Date(now.getTime() + EXPIRY_WARNING_MS), now);
    if (expiring.length === 0) return 0;
    const admins = await this.deps.users.listActiveAdminIds();
    const base = this.deps.frontendUrl?.replace(/\/$/, "");
    for (const credential of expiring) {
      const payload = { credential: credential.name, connection: credential.integrationName, expiresOn: credential.expiresAt.toISOString().slice(0, 10) };
      for (const recipientId of admins) {
        const notification = {
          recipientId,
          kind: "credential_expiring" as const,
          ticketId: null,
          actorId: null,
          payload,
          text: notificationText("credential_expiring", null, "", payload),
          link: base ? `${base}/settings/connections/${credential.integrationId}` : null,
        };
        for (const channel of this.deps.channels) {
          await channel.deliver(notification).catch((error: unknown) =>
            logger.warn("Credential expiry warning failed", { channel: channel.name, error: error instanceof Error ? error.message : String(error) }),
          );
        }
      }
      await this.deps.credentials.markWarned(credential.id);
    }
    return expiring.length;
  }
}
