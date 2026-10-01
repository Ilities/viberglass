import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { createEmailSender } from "../../../../services/notifications/createEmailSender";
import { NoEmailSender } from "../../../../services/notifications/EmailSender";
import { SesEmailSender } from "../../../../services/notifications/SesEmailSender";
import { SmtpEmailSender } from "../../../../services/notifications/SmtpEmailSender";

describe("createEmailSender", () => {
  it("uses SES on AWS, SMTP when self-hosted, and nothing without a sender address", () => {
    expect(createEmailSender({ EMAIL_FROM: "vg@example.com", EMAIL_PROVIDER: "ses" })).toBeInstanceOf(SesEmailSender);
    expect(createEmailSender({ EMAIL_FROM: "vg@example.com", SMTP_URL: "smtp://mail:587" })).toBeInstanceOf(SmtpEmailSender);
    expect(createEmailSender({ EMAIL_PROVIDER: "ses" })).toBeInstanceOf(NoEmailSender);
    expect(createEmailSender({ EMAIL_FROM: "vg@example.com" })).toBeInstanceOf(NoEmailSender);
    expect(createEmailSender({}).isConfigured()).toBe(false);
  });
});

describe("SesEmailSender", () => {
  it("sends a plain-text email from the configured address", async () => {
    const client = { send: jest.fn().mockResolvedValue({}) };
    const sender = new SesEmailSender("Viberglass <notifications@example.com>", client);

    await sender.send({ to: "maria@example.com", subject: "The plan is ready", text: "Open it: https://vg.example.com" });

    const command: SendEmailCommand = client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toEqual({
      FromEmailAddress: "Viberglass <notifications@example.com>",
      Destination: { ToAddresses: ["maria@example.com"] },
      Content: {
        Simple: {
          Subject: { Data: "The plan is ready", Charset: "UTF-8" },
          Body: { Text: { Data: "Open it: https://vg.example.com", Charset: "UTF-8" } },
        },
      },
    });
  });
});
