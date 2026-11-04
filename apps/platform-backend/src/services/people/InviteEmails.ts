import type { EmailSender } from "../notifications/EmailSender";
import { createEmailSender } from "../notifications/createEmailSender";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ service: "InviteEmails" });

/** Emails invite links when SMTP and the platform's address are configured; whoever invites can always copy the link. */
export class InviteEmails {
  constructor(
    private readonly email: Pick<EmailSender, "isConfigured" | "send"> = createEmailSender(),
    private readonly frontendUrl: string | undefined = process.env.PLATFORM_FRONTEND_URL,
  ) {}

  /** True when the email went out. `appName` names the app the invite is for. */
  async send(input: { to: string; path: string; inviterName: string; appName?: string }): Promise<boolean> {
    const base = this.frontendUrl?.replace(/\/$/, "");
    if (!this.email.isConfigured() || !base) return false;
    const what = input.appName ? `to use ${input.appName} on Viberglass` : "to Viberglass";
    try {
      await this.email.send({
        to: input.to,
        subject: `${input.inviterName} invited you ${what}`,
        text: `${input.inviterName} invited you ${what}. Join here (the link works once, for 7 days):\n\n${base}${input.path}`,
      });
      return true;
    } catch (error) {
      logger.warn("Failed to email an invite", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}
