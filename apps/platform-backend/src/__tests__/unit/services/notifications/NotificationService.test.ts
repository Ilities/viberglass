import { NotificationService } from "../../../../services/notifications/NotificationService";
import { ChatDmChannel } from "../../../../services/notifications/ChatDmChannel";
import { fakeChatProvider } from "../../../helpers/fakeChatProvider";
import { EmailChannel } from "../../../../services/notifications/EmailChannel";
import type { NotificationChannel, OutgoingNotification } from "../../../../services/notifications/NotificationChannel";

function service(channels: NotificationChannel[]) {
  return new NotificationService({
    participants: { list: jest.fn().mockResolvedValue([{ userId: "reviewer", name: "R", email: "r@x", role: "reviewer", addedAt: "" }]) },
    users: {
      listActiveAdminIds: jest.fn().mockResolvedValue(["admin"]),
      getContact: jest.fn().mockResolvedValue({ email: "pm@example.com", name: "Maria", deactivated: false }),
    },
    tasks: { getSummary: jest.fn().mockResolvedValue({ title: "Dark mode", key: "WEB-4", spaceSlug: "web" }) },
    channels,
    frontendUrl: "https://vg.example.com/",
  });
}

const notification = (overrides: Partial<OutgoingNotification>): OutgoingNotification => ({
  recipientId: "user-2",
  kind: "mentioned",
  ticketId: "t-1",
  actorId: "user-1",
  payload: {},
  text: "Maria mentioned you on “Dark mode”",
  link: "https://vg.example.com/spaces/web/tasks/WEB-4",
  ...overrides,
});

describe("NotificationService", () => {
  it("sends each recipient the sentence and a link to the task, through every channel", async () => {
    const delivered: OutgoingNotification[] = [];
    const inbox = { name: "inbox", deliver: jest.fn(async (n: OutgoingNotification) => void delivered.push(n)) };

    await service([inbox]).onActivity({ ticketId: "t-1", kind: "reviewer_added", actorId: "pm", payload: { userId: "reviewer" } });

    expect(delivered).toEqual([
      expect.objectContaining({
        recipientId: "reviewer",
        kind: "review_requested",
        text: "Maria asked you to review “Dark mode”",
        link: "https://vg.example.com/spaces/web/tasks/WEB-4",
      }),
    ]);
  });

  it("keeps delivering when one channel fails", async () => {
    const broken = { name: "broken", deliver: jest.fn().mockRejectedValue(new Error("Slack is down")) };
    const inbox = { name: "inbox", deliver: jest.fn().mockResolvedValue(undefined) };

    await service([broken, inbox]).onActivity({ ticketId: "t-1", kind: "reviewer_added", actorId: "pm", payload: { userId: "reviewer" } });

    expect(inbox.deliver).toHaveBeenCalledTimes(1);
  });
});

describe("ChatDmChannel", () => {
  const users = { getContact: jest.fn().mockResolvedValue({ email: "a@x", name: "A", deactivated: false }) };
  const identities = (chatUserId: string | null) => ({ getChatUserId: jest.fn().mockResolvedValue(chatUserId) });
  const services = (provider: ReturnType<typeof fakeChatProvider>) => () => [{ system: "slack", label: "Slack", provider }];

  it("messages a linked person directly on the chat service, with the link", async () => {
    const provider = fakeChatProvider();
    await new ChatDmChannel(services(provider), identities("U123"), users).deliver(notification({}));
    expect(provider.sendDirectMessage).toHaveBeenCalledWith("U123", "Maria mentioned you on “Dark mode”", {
      url: "https://vg.example.com/spaces/web/tasks/WEB-4",
      label: "Open it in Viberglass",
    });
  });

  it("stays quiet for people who haven't linked an account, for updates that belong in the thread, and for a service that isn't set up", async () => {
    const provider = fakeChatProvider();
    await new ChatDmChannel(services(provider), identities(null), users).deliver(notification({}));
    await new ChatDmChannel(services(provider), identities("U123"), users).deliver(notification({ kind: "step_completed" }));
    await new ChatDmChannel(services(fakeChatProvider({ configured: false })), identities("U123"), users).deliver(notification({}));
    expect(provider.sendDirectMessage).not.toHaveBeenCalled();
  });
});

describe("EmailChannel", () => {
  it("emails setup failures when SMTP is configured, and not mentions", async () => {
    const email = { isConfigured: jest.fn().mockReturnValue(true), send: jest.fn().mockResolvedValue(undefined) };
    const users = { getContact: jest.fn().mockResolvedValue({ email: "admin@example.com", name: "A", deactivated: false }) };
    const channel = new EmailChannel(email, users);

    await channel.deliver(notification({ kind: "mentioned" }));
    await channel.deliver(notification({ kind: "run_failed_setup", text: "A plan run failed and needs an admin" }));

    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@example.com", subject: "A plan run failed and needs an admin" }));
  });
});
