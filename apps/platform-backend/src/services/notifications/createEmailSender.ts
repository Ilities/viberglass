import type { EmailSender } from "./EmailSender";
import { NoEmailSender } from "./EmailSender";
import { SesEmailSender } from "./SesEmailSender";
import { SmtpEmailSender } from "./SmtpEmailSender";

/**
 * Picks the email transport from configuration: `EMAIL_FROM` plus either
 * `EMAIL_PROVIDER=ses` (AWS; set by the platform stack) or `SMTP_URL`
 * (self-hosted). Anything less sends nothing.
 */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const from = env.EMAIL_FROM?.trim();
  if (!from) return new NoEmailSender();
  if (env.EMAIL_PROVIDER?.trim() === "ses") return new SesEmailSender(from);
  const smtpUrl = env.SMTP_URL?.trim();
  return smtpUrl ? new SmtpEmailSender(smtpUrl, from) : new NoEmailSender();
}
