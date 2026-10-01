import nodemailer, { type Transporter } from "nodemailer";
import type { EmailSender } from "./EmailSender";

/** Email over SMTP, for self-hosted instances (`SMTP_URL`, e.g. smtp://user:pass@smtp.example.com:587). */
export class SmtpEmailSender implements EmailSender {
  private transporter: Transporter | null = null;

  constructor(
    private readonly smtpUrl: string,
    private readonly from: string,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    this.transporter ??= nodemailer.createTransport(this.smtpUrl);
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
