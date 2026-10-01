/** Sends one plain-text email. Unconfigured, it sends nothing and every caller carries on (ADR 0002). */
export interface EmailSender {
  isConfigured(): boolean;
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

/** No email transport configured. */
export class NoEmailSender implements EmailSender {
  isConfigured(): boolean {
    return false;
  }

  async send(): Promise<void> {}
}
