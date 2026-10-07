import logger from "../../config/logger";
import { UserDAO } from "../../persistence/user/UserDAO";
import type { EmailSender } from "../notifications/EmailSender";
import { createEmailSender } from "../notifications/createEmailSender";
import { PasswordResetService } from "./PasswordResetService";

/** One email per address in this window, so the form can't be used to flood someone's inbox. */
const RESEND_AFTER_MS = 60_000;

interface Dependencies {
  users: Pick<UserDAO, "findByEmail">;
  resets: Pick<PasswordResetService, "createLink">;
  email: Pick<EmailSender, "isConfigured" | "send">;
  frontendUrl: string | undefined;
  now: () => number;
}

/**
 * Emails a reset link to someone who forgot their password. Whether the
 * account exists never shows: the caller gets the same answer either way.
 */
export class ForgotPasswordService {
  private readonly deps: Dependencies;
  private readonly lastSent = new Map<string, number>();

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      users: new UserDAO(),
      resets: new PasswordResetService(),
      email: createEmailSender(),
      frontendUrl: process.env.PLATFORM_FRONTEND_URL,
      now: Date.now,
      ...deps,
    };
  }

  /** Whether this installation can email reset links at all; without it, an admin hands them out. */
  canEmail(): boolean {
    return this.deps.email.isConfigured() && Boolean(this.deps.frontendUrl?.trim());
  }

  /** Sends the link when the address belongs to an active account. Never throws. */
  async request(email: string): Promise<void> {
    if (!this.canEmail()) {
      logger.info("Password reset requested, but email isn't configured", { email });
      return;
    }
    const now = this.deps.now();
    const previous = this.lastSent.get(email);
    if (previous !== undefined && now - previous < RESEND_AFTER_MS) return;
    this.lastSent.set(email, now);

    try {
      const user = await this.deps.users.findByEmail(email);
      if (!user || user.deactivatedAt) return;
      const token = await this.deps.resets.createLink(user.id, null);
      const base = (this.deps.frontendUrl ?? "").trim().replace(/\/$/, "");
      await this.deps.email.send({
        to: user.email,
        subject: "Reset your Viberglass password",
        text: `Someone asked to reset the password of your Viberglass account. Set a new one here (the link works once, for 24 hours):\n\n${base}/reset-password/${token}\n\nIf it wasn't you, ignore this email; your password stays as it is.`,
      });
    } catch (error) {
      logger.warn("Failed to email a password reset link", { error: error instanceof Error ? error.message : String(error) });
    }
  }
}
