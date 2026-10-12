import type { IntegrationPlugin } from "@viberglass/integration-core";
import type { AuthCredentials } from "@viberglass/types";
import { ChatBotStatusReader } from "../../../chat/ChatBotStatusReader";
import { fakeChatProvider } from "../../helpers/fakeChatProvider";

const CREDENTIALS: AuthCredentials = { type: "token", botToken: "t" };

function reader(plugin: IntegrationPlugin | undefined, credentials: AuthCredentials = CREDENTIALS) {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const status = new ChatBotStatusReader({
    refresh,
    plugins: { get: () => plugin },
    connections: { credentials: jest.fn().mockResolvedValue(credentials) },
  });
  return { status, refresh };
}

const plugin = (configured: boolean, checkConnection?: IntegrationPlugin["checkConnection"]): IntegrationPlugin => ({
  id: "chat-app",
  label: "Chat app",
  description: "",
  category: "chat",
  status: "ready",
  configFields: [],
  chat: fakeChatProvider({ configured }),
  checkConnection,
});

describe("ChatBotStatusReader", () => {
  it("catches up with the connections before answering", async () => {
    const { status, refresh } = reader(plugin(false));
    await expect(status.status("chat-app")).resolves.toEqual({ configured: false });
    expect(refresh).toHaveBeenCalled();
  });

  it("is not configured for an integration without chat", async () => {
    await expect(reader(undefined).status.status("other")).resolves.toEqual({ configured: false });
  });

  it("checks the stored credentials with the service and says why it turned them down", async () => {
    const check = jest.fn().mockResolvedValue(undefined);
    await expect(reader(plugin(true, check)).status.status("chat-app")).resolves.toEqual({ configured: true });
    expect(check).toHaveBeenCalledWith({ type: "token", botToken: "t" });

    const rejected = jest.fn().mockRejectedValue(new Error("Slack authentication failed: invalid_auth"));
    await expect(reader(plugin(true, rejected)).status.status("chat-app")).resolves.toEqual({
      configured: true,
      error: "Slack authentication failed: invalid_auth",
    });
  });
});
