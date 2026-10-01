import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { EmailSender } from "./EmailSender";

type SesClient = Pick<SESv2Client, "send">;

/**
 * Email through Amazon SES, for instances on AWS. It signs with the backend's
 * task role, so there are no SMTP credentials to store; the sending domain is
 * verified by the platform stack.
 */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly from: string,
    private readonly client: SesClient = new SESv2Client({ region: process.env.AWS_REGION || "eu-west-1" }),
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async send(message: { to: string; subject: string; text: string }): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: { Text: { Data: message.text, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}
